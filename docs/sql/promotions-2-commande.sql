-- ============================================================================
-- Ezial — Campagnes promotionnelles, phase 1 — MIGRATION 2 / 3 : CALCUL, COMMANDE, PAIEMENT, ANNULATION
-- Contrat : docs/promotions/contrat-phase1.md
--
-- QUOI
--   1. ezial_private.promotion_compute : calcul UNIQUE (éligibilité + montants + répartition par boutique),
--      utilisé par l'aperçu du panier (promotions_preview), par create_order et par validate_promo_code ;
--   2. public.promotions_preview(payload) (clients connectés) et public.public_active_promotions() (tous) ;
--   3. create_order : UN SEUL bloc remplacé (l'ancien code promo -> campagne), par remplacement de texte
--      vérifié sur la définition de PRODUCTION relue le 25 nov. 2026 (avec la livraison urgente,
--      empreinte md5 sans « \r » = 10178f6554882cf5390eb6f0a7a13381) : si le repère n'est pas trouvé
--      exactement une fois, la migration s'arrête SANS RIEN MODIFIER. Prix, stock, commissions, livraison,
--      livraison urgente (+500 : appel order_urgent_fee, is_urgent, urgent_fee), Baya, cadeaux : inchangés ;
--   4. ezial_private.trg_orders_on_paid (commandes « à payer » Orange Money) : la vente créée au paiement
--      retire la part promotion de la boutique (promo_compensation) ; commission inchangée ;
--   5. annulation (commande annulée, y compris impayée annulée automatiquement) : utilisation, budget et
--      compensations « à reverser » rendus UNE seule fois ; part d'une boutique annulée : sa compensation
--      « à reverser » est annulée ;
--   6. validate_promo_code (anciennes versions du site) : lit désormais les campagnes.
-- RÈGLES (Ezial finance la promotion) : la boutique garde sa commission habituelle (calculée sur le prix
--   payé avant la campagne, comme aujourd'hui) ; sa part de la réduction (A) est retirée de sa vente automatique ;
--   Ezial lui reverse à la main A − V (promotion_compensations), V étant la part que la boutique a acceptée de
--   financer (promotion_seller_shares, facultative, réductions produits seulement). Pas de condition de quartier.
--   total = (sous-total − promos produits − promo_discount) + livraison − delivery_discount + emballage cadeau
--           + supplément livraison urgente (jamais réduit par une campagne).
-- PRÉREQUIS : promotions-1-structure.sql exécutée ; lancement-livraison-urgente.sql déjà en production
--   (sinon le repère de create_order n'est pas trouvé et la migration s'arrête sans rien modifier).
-- AUCUN EFFET tant qu'aucune campagne n'est « active » : sans campagne, une commande est strictement identique
--   à aujourd'hui (seul changement visible : un code saisi est cherché dans les campagnes, donc EZI10, suspendu,
--   répond « Ce code est suspendu. »).
-- RELANÇABLE : oui. RETOUR ARRIÈRE : docs/sql/promotions-2-retour-arriere.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.promotions') is null or to_regclass('public.promotion_compensations') is null then
    raise exception 'Exécutez d''abord docs/sql/promotions-1-structure.sql.';
  end if;
end $$;

-- 0. Copie des définitions d'origine (contrôle du retour arrière). Seule la PREMIÈRE exécution enregistre.
create table if not exists ezial_private.promotions_saved_functions (
  sig text primary key, def text not null, saved_at timestamptz not null default now());
revoke all on ezial_private.promotions_saved_functions from public, anon, authenticated;
insert into ezial_private.promotions_saved_functions (sig, def)
select v.sig, pg_get_functiondef(v.sig::regprocedure)
  from (values ('public.create_order(jsonb)'), ('ezial_private.trg_orders_on_paid()'), ('public.validate_promo_code(text,integer)')) v(sig)
 where position('promotion_' in pg_get_functiondef(v.sig::regprocedure)) = 0
on conflict (sig) do nothing;

-- 1. Une ligne du panier est-elle visée par la campagne ? (aucune cible = tout le catalogue)
create or replace function ezial_private.promotion_line_matches(p_promotion_id uuid, p_line jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.promotion_targets t where t.promotion_id = p_promotion_id)
      or exists (select 1 from public.promotion_targets t where t.promotion_id = p_promotion_id and (
             (t.target_type = 'product' and t.target_ref = p_line->>'product_id')
          or (t.target_type = 'shop' and t.target_ref = p_line->>'shop_id')
          or (t.target_type = 'category' and t.target_ref = p_line->>'category')
          or (t.target_type = 'subcategory' and t.target_ref = (p_line->>'category') || '/' || (p_line->>'subcategory'))));
$$;

create or replace function ezial_private.promotion_fcfa(p numeric) returns text
language sql immutable set search_path = '' as $$ select replace(to_char(round(p), 'FM999,999,999,990'), ',', ' ') || ' FCFA' $$;

-- 2. Calcul d'une campagne pour un panier.
--    p_lines : [{product_id, shop_id, category, subcategory, line_total (prix réellement payé), delivery (bool)}]
--    Renvoie {ok, message, promotion_id, code, name, kind, ends_at, eligible_amount, product_discount,
--             delivery_discount, delivery_fee, seller_funded, ezial_cost, total_discount,
--             shares:[{shop_id, eligible, amount (A), seller_share (V), ezial (A − V)}]}
create or replace function ezial_private.promotion_compute(
  p public.promotions, p_lines jsonb, p_customer uuid, p_delivery_fee integer,
  p_exclude_order uuid default null, p_options jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fee integer := greatest(coalesce(p_delivery_fee, 0), 0);
  v_skip_targets boolean := coalesce((p_options->>'skip_targets')::boolean, false);
  v_eligible numeric := 0; v_eligible_delivered numeric := 0; v_total_delivered numeric := 0;
  v_pd integer := 0; v_dd integer := 0; v_cost integer; v_seller integer := 0; v_shares jsonb := '[]'::jsonb;
  v_fail jsonb;
begin
  v_fail := jsonb_build_object('ok', false, 'promotion_id', p.id, 'code', p.code);
  if p.id is null or p.status = 'draft' then return v_fail || jsonb_build_object('message', 'Code promo invalide.'); end if;
  if p.status = 'paused' then return v_fail || jsonb_build_object('message', 'Ce code est suspendu.'); end if;
  if p.status = 'ended' or now() >= p.ends_at then return v_fail || jsonb_build_object('message', 'Ce code a expiré.'); end if;
  if now() < p.starts_at then return v_fail || jsonb_build_object('message', 'Ce code n''est pas encore valable.'); end if;
  if (p.max_uses_total is not null and p.uses_count >= p.max_uses_total)
     or (p.budget_max is not null and p.budget_used >= p.budget_max) then
    return v_fail || jsonb_build_object('message', 'Ce code n''est plus disponible.');
  end if;
  if p.audience = 'new_customers' and (p_customer is null or exists (
       select 1 from public.orders o where o.customer_id = p_customer and o.status <> 'cancelled' and o.id is distinct from p_exclude_order)) then
    return v_fail || jsonb_build_object('message', 'Ce code est réservé aux nouveaux clients.');
  end if;
  if p_customer is not null and p.max_uses_per_customer is not null and (
       select count(*) from public.promotion_redemptions r
        where r.promotion_id = p.id and r.customer_id = p_customer and r.status = 'counted' and r.order_id is distinct from p_exclude_order
     ) >= p.max_uses_per_customer then
    return v_fail || jsonb_build_object('message', 'Vous avez déjà utilisé ce code.');
  end if;

  select coalesce(sum(l.lt) filter (where l.ok), 0), coalesce(sum(l.lt) filter (where l.ok and l.dlv), 0), coalesce(sum(l.lt) filter (where l.dlv), 0)
    into v_eligible, v_eligible_delivered, v_total_delivered
    from (select greatest(coalesce((e->>'line_total')::numeric, 0), 0) lt, coalesce((e->>'delivery')::boolean, false) dlv,
                 v_skip_targets or ezial_private.promotion_line_matches(p.id, e) ok
            from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e) l;
  if v_eligible <= 0 then
    return v_fail || jsonb_build_object('message', 'Aucun article de votre panier n''est concerné par ce code.');
  end if;
  if v_eligible < p.min_amount then
    return v_fail || jsonb_build_object('message', format('Il manque %s d''articles concernés pour profiter de ce code (minimum %s).',
      ezial_private.promotion_fcfa(p.min_amount - v_eligible), ezial_private.promotion_fcfa(p.min_amount)));
  end if;

  if p.kind = 'fixed' then
    v_pd := least(round(p.value), v_eligible);
  elsif p.kind = 'percent' then
    v_pd := least(round(v_eligible * p.value / 100), coalesce(p.max_discount, v_eligible), v_eligible);
  elsif coalesce((p_options->>'skip_delivery')::boolean, false) then
    v_dd := 0;
  elsif v_eligible_delivered <= 0 then
    return v_fail || jsonb_build_object('message', 'Ce code concerne la livraison : choisissez la livraison à domicile pour en profiter.');
  else
    v_dd := least(round(v_fee * v_eligible_delivered / v_total_delivered), coalesce(p.delivery_cap, v_fee), v_fee);
  end if;
  -- Répartition de la réduction produits par boutique (A) : au prorata du montant éligible, au franc près
  -- (plus forts restes), jamais plus que la part éligible de la boutique ; la somme est exacte.
  -- Part vendeur acceptée (V) : fixe par commande = min(A, valeur) ; pourcentage = arrondi(A × valeur / 100).
  if v_pd > 0 then
    with s as (
      select (e->>'shop_id')::uuid shop_id, sum(greatest(coalesce((e->>'line_total')::numeric, 0), 0)) el
        from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
       where v_skip_targets or ezial_private.promotion_line_matches(p.id, e)
       group by 1),
    a as (select shop_id, el, floor(v_pd * el / v_eligible) base, (v_pd * el / v_eligible) - floor(v_pd * el / v_eligible) frac from s),
    r as (select a.*, row_number() over (order by frac desc, shop_id) rn, v_pd - sum(base) over () reste from a),
    al as (select r.shop_id, round(r.el)::integer el, least(round(r.el), r.base + case when r.rn <= r.reste then 1 else 0 end)::integer amt from r),
    v as (select al.*, coalesce(case ss.share_type when 'fixed' then least(al.amt, ss.share_value)
                                                    when 'percent' then least(al.amt, round(al.amt * ss.share_value / 100)) end, 0)::integer vs
            from al left join public.promotion_seller_shares ss on ss.promotion_id = p.id and ss.shop_id = al.shop_id and ss.agreed)
    select coalesce(jsonb_agg(jsonb_build_object('shop_id', shop_id, 'eligible', el, 'amount', amt, 'seller_share', vs, 'ezial', amt - vs) order by shop_id), '[]'::jsonb),
           coalesce(sum(vs), 0)
      into v_shares, v_seller from v;
  end if;
  -- Coût Ezial = réduction produits − parts vendeurs + réduction livraison (seul ce coût compte dans le budget)
  v_cost := v_pd - v_seller + v_dd;
  if p.budget_max is not null and p.budget_used + v_cost > p.budget_max then
    return v_fail || jsonb_build_object('message', 'Ce code n''est plus disponible.');
  end if;

  return jsonb_build_object('ok', true, 'message', null, 'promotion_id', p.id, 'code', p.code, 'name', p.name, 'kind', p.kind,
    'ends_at', p.ends_at, 'eligible_amount', round(v_eligible)::integer, 'product_discount', v_pd, 'delivery_discount', v_dd,
    'delivery_fee', v_fee, 'seller_funded', v_seller, 'ezial_cost', v_cost, 'total_discount', v_pd + v_dd, 'shares', v_shares);
end $$;

-- 3. Meilleure campagne AUTOMATIQUE (sans code) : plus grande réduction pour le client (produits + livraison,
--    = coût Ezial quand aucune boutique ne finance de part) ; à égalité, celle qui finit le plus tôt.
--    p_lock = true (commande) : les candidates sont verrouillées (ordre fixe) puis recalculées.
create or replace function ezial_private.promotion_best_automatic(
  p_lines jsonb, p_customer uuid, p_delivery_fee integer, p_exclude_order uuid, p_lock boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_p public.promotions; r jsonb; best jsonb; v_ids uuid[] := '{}';
begin
  for v_p in select * from public.promotions where code is null and status = 'active' and starts_at <= now() and ends_at > now() loop
    r := ezial_private.promotion_compute(v_p, p_lines, p_customer, p_delivery_fee, p_exclude_order);
    if (r->>'ok')::boolean and (r->>'total_discount')::integer > 0 then
      v_ids := v_ids || v_p.id;
      if best is null or (r->>'total_discount')::integer > (best->>'total_discount')::integer
         or ((r->>'total_discount')::integer = (best->>'total_discount')::integer and ((r->>'ends_at')::timestamptz, r->>'promotion_id') < ((best->>'ends_at')::timestamptz, best->>'promotion_id')) then
        best := r;
      end if;
    end if;
  end loop;
  if not p_lock or best is null then return best; end if;

  best := null;
  for v_p in select * from public.promotions where id = any(v_ids) order by id for update loop
    r := ezial_private.promotion_compute(v_p, p_lines, p_customer, p_delivery_fee, p_exclude_order);
    if (r->>'ok')::boolean and (r->>'total_discount')::integer > 0 and (best is null or (r->>'total_discount')::integer > (best->>'total_discount')::integer
         or ((r->>'total_discount')::integer = (best->>'total_discount')::integer and ((r->>'ends_at')::timestamptz, r->>'promotion_id') < ((best->>'ends_at')::timestamptz, best->>'promotion_id'))) then
      best := r;
    end if;
  end loop;
  return best;
end $$;

-- 4. Application à une commande (appelée par create_order, une fois les lignes et la livraison calculées).
create or replace function ezial_private.promotion_apply_to_order(p_order_id uuid, p_code text, p_delivery_fee integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; v_lines jsonb; v_p public.promotions; r jsonb; v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_red uuid; s jsonb; v_amount integer; v_seller integer; v_os uuid;
begin
  select * into o from public.orders where id = p_order_id;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'shop_id', oi.shop_id, 'category', pr.category,
           'subcategory', pr.subcategory, 'line_total', oi.line_total, 'delivery', os.fulfillment_type = 'delivery')), '[]'::jsonb)
    into v_lines
    from public.order_items oi join public.order_shops os on os.id = oi.order_shop_id left join public.products pr on pr.id = oi.product_id
   where oi.order_id = p_order_id;

  if v_code is not null then
    -- Verrou : deux commandes simultanées ne peuvent jamais dépasser une limite ou le budget.
    select * into v_p from public.promotions where code = v_code for update;
    if v_p.id is null then raise exception 'Code promo invalide.' using errcode = 'P0001'; end if;
    r := ezial_private.promotion_compute(v_p, v_lines, o.customer_id, p_delivery_fee, o.id);
    if not (r->>'ok')::boolean then raise exception '%', r->>'message' using errcode = 'P0001'; end if;
  else
    r := ezial_private.promotion_best_automatic(v_lines, o.customer_id, p_delivery_fee, o.id, true);
    if r is null then
      return jsonb_build_object('promotion_id', null, 'code', null, 'product_discount', 0, 'delivery_discount', 0);
    end if;
  end if;

  insert into public.promotion_redemptions (promotion_id, order_id, customer_id, status, eligible_amount, product_discount, delivery_discount, ezial_cost, seller_funded)
  values ((r->>'promotion_id')::uuid, o.id, o.customer_id, 'counted', (r->>'eligible_amount')::integer, (r->>'product_discount')::integer,
          (r->>'delivery_discount')::integer, (r->>'ezial_cost')::integer, (r->>'seller_funded')::integer)
  returning id into v_red;
  update public.promotions set uses_count = uses_count + 1, budget_used = budget_used + (r->>'ezial_cost')::integer
   where id = (r->>'promotion_id')::uuid;

  for s in select * from jsonb_array_elements(r->'shares') loop
    v_amount := (s->>'amount')::integer;          -- A : part de la réduction de la boutique
    v_seller := (s->>'seller_share')::integer;    -- V : partie qu'elle a acceptée de financer
    continue when v_amount <= 0;
    select id into v_os from public.order_shops where order_id = o.id and shop_id = (s->>'shop_id')::uuid;
    update public.order_shops set promo_compensation = v_amount, promo_seller_share = v_seller where id = v_os;
    if v_amount - v_seller > 0 then              -- Ezial reverse A − V
      insert into public.promotion_compensations (redemption_id, order_id, order_shop_id, shop_id, amount, seller_share, gross_allocation)
      values (v_red, o.id, v_os, (s->>'shop_id')::uuid, v_amount - v_seller, v_seller, v_amount);
    end if;
    -- Vente déjà créée (commande sans paiement préalable) : la part promotion sort du solde automatique ;
    -- la commission ne change pas. Commande « à payer » : la vente sera créée au paiement (trg_orders_on_paid).
    update public.seller_transactions set gross_amount = gross_amount - v_amount, net_amount = net_amount - v_amount
     where order_id = o.id and shop_id = (s->>'shop_id')::uuid and type = 'sale' and status <> 'cancelled';
  end loop;

  return jsonb_build_object('promotion_id', r->>'promotion_id', 'code', case when v_code is not null then r->>'code' end,
    'product_discount', (r->>'product_discount')::integer, 'delivery_discount', (r->>'delivery_discount')::integer);
end $$;

-- 5. Annulation : utilisation, budget et compensations « à reverser » rendus une seule fois.
create or replace function ezial_private.promotion_note_paid_cancelled(p_compensation_id uuid, p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_note constant text := 'Commande annulée après le versement de cette compensation : montant à récupérer auprès de la boutique.';
begin
  update public.promotion_compensations set note = concat_ws(' · ', nullif(note, ''), v_note)
   where id = p_compensation_id and status = 'paid' and position(v_note in coalesce(note, '')) = 0;
  perform ezial_private.emit_event('finance.anomaly', p_compensation_id, 'promo_compensation_paid_cancelled',
    jsonb_build_object('reason', v_note, 'order_id', p_order_id));
end $$;

create or replace function ezial_private.promotion_release_order(p_order_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r public.promotion_redemptions; c record;
begin
  update public.promotion_redemptions set status = 'cancelled', cancelled_at = now()
   where order_id = p_order_id and status = 'counted' returning * into r;
  if r.id is null then return false; end if;   -- déjà rendue (ou sans campagne) : rien à faire
  update public.promotions set uses_count = greatest(uses_count - 1, 0), budget_used = greatest(budget_used - r.ezial_cost, 0)
   where id = r.promotion_id;
  update public.promotion_compensations set status = 'cancelled', note = concat_ws(' · ', nullif(note, ''), 'Commande annulée.')
   where redemption_id = r.id and status = 'due';
  for c in select id from public.promotion_compensations where redemption_id = r.id and status = 'paid' loop
    perform ezial_private.promotion_note_paid_cancelled(c.id, p_order_id);
  end loop;
  perform ezial_private.audit('system', 'promotion_released', 'promotion_redemption', r.id,
    jsonb_build_object('order_id', p_order_id, 'promotion_id', r.promotion_id, 'ezial_cost', r.ezial_cost));
  return true;
end $$;

-- Déclencheur DIFFÉRÉ (fin de transaction) : la campagne n'est verrouillée qu'après le reste de l'annulation
-- (restitution du stock…), ce qui évite tout interblocage avec une commande en cours.
create or replace function ezial_private.trg_promotions_order_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.orders o where o.id = new.id and o.status = 'cancelled') then
    perform ezial_private.promotion_release_order(new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_promotions_order_cancelled on public.orders;
create constraint trigger trg_promotions_order_cancelled after update on public.orders deferrable initially deferred for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled') execute function ezial_private.trg_promotions_order_cancelled();

-- Part d'UNE boutique annulée (le reste de la commande continue) : sa vente est annulée, sa compensation aussi.
create or replace function ezial_private.trg_promotions_order_shop_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  update public.promotion_compensations set status = 'cancelled', note = concat_ws(' · ', nullif(note, ''), 'Part de la boutique annulée.')
   where order_shop_id = new.id and status = 'due';
  for c in select id from public.promotion_compensations where order_shop_id = new.id and status = 'paid' loop
    perform ezial_private.promotion_note_paid_cancelled(c.id, new.order_id);
  end loop;
  return null;
end $$;
drop trigger if exists trg_promotions_order_shop_cancelled on public.order_shops;
create trigger trg_promotions_order_shop_cancelled after update of status on public.order_shops for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled') execute function ezial_private.trg_promotions_order_shop_cancelled();

revoke all on function ezial_private.promotion_line_matches(uuid, jsonb), ezial_private.promotion_fcfa(numeric),
  ezial_private.promotion_compute(public.promotions, jsonb, uuid, integer, uuid, jsonb),
  ezial_private.promotion_best_automatic(jsonb, uuid, integer, uuid, boolean),
  ezial_private.promotion_apply_to_order(uuid, text, integer), ezial_private.promotion_note_paid_cancelled(uuid, uuid),
  ezial_private.promotion_release_order(uuid), ezial_private.trg_promotions_order_cancelled(),
  ezial_private.trg_promotions_order_shop_cancelled() from public, anon, authenticated;

-- 6. Aperçu pour le panier (n'enregistre rien ; create_order recalcule tout)
create or replace function public.promotions_preview(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; v_lines jsonb := '[]'::jsonb; v_prod record; v_var record; v_pid uuid; v_vid uuid; v_qty numeric;
  v_orig numeric; v_unit numeric; v_dlv boolean; v_any_delivery boolean := false; v_fee numeric; v_min numeric; v_max numeric;
  v_code text := nullif(upper(btrim(coalesce(payload->>'promoCode', ''))), ''); v_p public.promotions; r jsonb;
begin
  if jsonb_typeof(payload->'items') = 'array' then
    for it in select * from jsonb_array_elements(payload->'items') loop
      begin
        v_qty := nullif(it->>'quantity', '')::numeric;
        v_pid := nullif(it->>'productId', '')::uuid;
        v_vid := nullif(it->>'variantId', '')::uuid;
      exception when others then
        continue;
      end;
      continue when v_qty is null or v_qty <= 0 or v_pid is null;
      select p.id, p.shop_id, p.status, p.base_price, p.is_promo, p.promo_price, p.promo_start, p.promo_end, p.category, p.subcategory,
             s.status as shop_status
        into v_prod from public.products p join public.shops s on s.id = p.shop_id where p.id = v_pid;
      continue when v_prod.id is null or v_prod.status <> 'active' or v_prod.shop_status <> 'active';
      if v_vid is not null then
        select id, price into v_var from public.product_variants where id = v_vid and product_id = v_prod.id;
      else
        select id, price into v_var from public.product_variants
         where product_id = v_prod.id and attributes = coalesce(it->'selectedOptions', '{}'::jsonb) limit 1;
      end if;
      continue when v_var.id is null;
      -- Prix comme create_order : variante (sinon prix de base), puis promotion produit en cours
      v_orig := coalesce(v_var.price, v_prod.base_price);
      if coalesce(v_prod.is_promo, false) and (v_prod.promo_start is null or now() >= v_prod.promo_start)
         and (v_prod.promo_end is null or now() <= v_prod.promo_end) and v_prod.promo_price is not null and v_prod.base_price > 0 then
        v_unit := round(v_orig * (v_prod.promo_price::numeric / v_prod.base_price::numeric));
      else
        v_unit := v_orig;
      end if;
      v_dlv := coalesce(payload->'shopFulfillments'->(v_prod.shop_id::text)->>'type', 'delivery') = 'delivery';
      v_any_delivery := v_any_delivery or v_dlv;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'shop_id', v_prod.shop_id,
        'category', v_prod.category, 'subcategory', v_prod.subcategory, 'line_total', round(v_unit * v_qty), 'delivery', v_dlv));
    end loop;
  end if;

  -- Frais estimés par le site, bornés par le barème (aperçu seulement : create_order calcule les vrais frais)
  v_fee := 0;
  if v_any_delivery then
    select minimum_fee, maximum_fee into v_min, v_max from public.delivery_pricing_settings limit 1;
    v_fee := greatest(coalesce((payload->>'deliveryFeeEstimate')::numeric, 0), coalesce(v_min, 0));
    if v_max is not null then v_fee := least(v_fee, v_max); end if;
  end if;

  if v_code is not null then
    select * into v_p from public.promotions where code = v_code;
    if v_p.id is null then return jsonb_build_object('valid', false, 'message', 'Code promo invalide.', 'applied', null); end if;
    r := ezial_private.promotion_compute(v_p, v_lines, (select auth.uid()), round(v_fee)::integer);
    if not (r->>'ok')::boolean then return jsonb_build_object('valid', false, 'message', r->>'message', 'applied', null); end if;
  else
    r := ezial_private.promotion_best_automatic(v_lines, (select auth.uid()), round(v_fee)::integer, null, false);
    if r is null then return jsonb_build_object('valid', true, 'message', null, 'applied', null); end if;
  end if;
  return jsonb_build_object('valid', true, 'message', null, 'applied', jsonb_build_object(
    'promotionId', r->>'promotion_id', 'code', case when v_code is not null then r->>'code' end, 'name', r->>'name', 'kind', r->>'kind',
    'productDiscount', (r->>'product_discount')::integer, 'deliveryDiscount', (r->>'delivery_discount')::integer,
    'deliveryFee', (r->>'delivery_fee')::integer, 'eligibleAmount', (r->>'eligible_amount')::integer, 'automatic', v_code is null));
end $$;
revoke all on function public.promotions_preview(jsonb) from public, anon;
grant execute on function public.promotions_preview(jsonb) to authenticated, service_role;

-- 7. Campagnes AUTOMATIQUES en cours (jamais un code), pour afficher « Livraison offerte »
create or replace function public.public_active_promotions()
returns table (promotion_id uuid, name text, kind text, min_amount integer, delivery_cap integer, ends_at timestamptz, targets jsonb, neighborhoods text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.kind, p.min_amount, p.delivery_cap, p.ends_at,
         coalesce((select jsonb_agg(jsonb_build_object('type', t.target_type, 'ref', t.target_ref) order by t.target_type, t.target_ref)
                     from public.promotion_targets t where t.promotion_id = p.id), '[]'::jsonb),
         '{}'::text[]   -- pas de zone : toute la région de Dakar (colonne gardée pour compatibilité)
    from public.promotions p
   where p.code is null and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
     and (p.max_uses_total is null or p.uses_count < p.max_uses_total)
     and (p.budget_max is null or p.budget_used < p.budget_max)
   order by p.ends_at, p.id;
$$;
revoke all on function public.public_active_promotions() from public;
grant execute on function public.public_active_promotions() to anon, authenticated, service_role;

-- 8. Ancien contrôle des codes (anciennes versions du site) : lit les campagnes. Réduction sur le sous-total
--    envoyé (cibles et quartier vérifiés par create_order) ; un code « livraison offerte » renvoie 0.
create or replace function public.validate_promo_code(p_code text, p_subtotal integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_p public.promotions; r jsonb;
begin
  select * into v_p from public.promotions where code = upper(btrim(coalesce(p_code, '')));
  if v_p.id is null then return jsonb_build_object('valid', false, 'message', 'Code promo invalide.'); end if;
  r := ezial_private.promotion_compute(v_p, jsonb_build_array(jsonb_build_object('line_total', greatest(coalesce(p_subtotal, 0), 0), 'delivery', false)),
         (select auth.uid()), 0, null, '{"skip_targets": true, "skip_delivery": true}'::jsonb);
  if not (r->>'ok')::boolean then return jsonb_build_object('valid', false, 'message', r->>'message'); end if;
  return jsonb_build_object('valid', true, 'discount_amount', (r->>'product_discount')::integer, 'code', v_p.code, 'kind', v_p.kind);
end $$;

-- 9. create_order : remplacement CIBLÉ du bloc « code promo » (repère unique, sinon rien n'est modifié)
do $patch$
declare
  v_def text := replace(pg_get_functiondef('public.create_order(jsonb)'::regprocedure), chr(13), '');
  v_old text := replace($old$v_promo_code := nullif(trim(payload->>'promoCode'), '');
if v_promo_code is not null then
  v_promo_result := public.validate_promo_code(v_promo_code, (v_products_subtotal - v_discount_total)::integer);
  if coalesce((v_promo_result->>'valid')::boolean, false) then
    v_promo_discount := (v_promo_result->>'discount_amount')::numeric;
  else
    raise exception '%', coalesce(v_promo_result->>'message', 'Code promo invalide.');
  end if;
end if;

v_urgent_fee := ezial_private.order_urgent_fee(payload, v_needs_delivery); -- livraison urgente

update public.orders
set
products_subtotal = v_products_subtotal,
discount_amount = v_discount_total + v_promo_discount,
delivery_fee = v_delivery_fee,
promo_code = v_promo_code,
is_urgent = (v_urgent_fee > 0),
urgent_fee = v_urgent_fee,
total_amount = (v_products_subtotal - v_discount_total - v_promo_discount) + v_delivery_fee + v_gift_wrap_fee + v_urgent_fee,
updated_at = now()
where id = v_order.id
returning *
into v_order;$old$, chr(13), '');
  v_new text := replace($new$v_promo_code := nullif(trim(payload->>'promoCode'), '');
-- Campagnes promotionnelles (docs/sql/promotions-2-commande.sql) : le code saisi, sinon la meilleure
-- campagne automatique ; utilisation comptée sous verrou, compensations des boutiques créées.
v_promo_result := ezial_private.promotion_apply_to_order(v_order.id, v_promo_code, round(v_delivery_fee)::integer);
v_promo_discount := (v_promo_result->>'product_discount')::numeric;
v_promo_code := v_promo_result->>'code';

v_urgent_fee := ezial_private.order_urgent_fee(payload, v_needs_delivery); -- livraison urgente

update public.orders
set
products_subtotal = v_products_subtotal,
discount_amount = v_discount_total + v_promo_discount,
delivery_fee = v_delivery_fee,
promo_code = v_promo_code,
is_urgent = (v_urgent_fee > 0),
urgent_fee = v_urgent_fee,
promotion_id = nullif(v_promo_result->>'promotion_id', '')::uuid,
promo_discount = v_promo_discount,
delivery_discount = (v_promo_result->>'delivery_discount')::numeric,
total_amount = (v_products_subtotal - v_discount_total - v_promo_discount) + v_delivery_fee - (v_promo_result->>'delivery_discount')::numeric + v_gift_wrap_fee + v_urgent_fee,
updated_at = now()
where id = v_order.id
returning *
into v_order;$new$, chr(13), '');
begin
  if position('promotion_apply_to_order' in v_def) > 0 then
    raise notice 'create_order() applique déjà les campagnes : rien à faire.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) then
    raise exception 'create_order() a changé : le bloc « code promo » est introuvable ou n''est pas unique. Migration annulée, rien n''a été modifié.';
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;

-- 10. Paiement d'une commande « à payer » : la vente créée retire la part promotion (commission inchangée)
do $patch$
declare
  v_def text := replace(pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure), chr(13), '');
  v_old text := replace($old$  select s.shop_id, s.order_id, s.id, 'sale', round(s.subtotal)::integer, round(s.commission_amount)::integer,
         round(s.subtotal - s.commission_amount)::integer, 'available'$old$, chr(13), '');
  v_new text := replace($new$  select s.shop_id, s.order_id, s.id, 'sale', round(s.subtotal - s.promo_compensation)::integer, round(s.commission_amount)::integer,
         round(s.subtotal - s.promo_compensation - s.commission_amount)::integer, 'available'$new$, chr(13), '');
begin
  if position('promo_compensation' in v_def) > 0 then
    raise notice 'trg_orders_on_paid() retire déjà la part promotion : rien à faire.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) then
    raise exception 'trg_orders_on_paid() a changé : le repère de la vente est introuvable ou n''est pas unique. Migration annulée, rien n''a été modifié.';
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;

commit;

-- Vérification : toutes les lignes « ok » attendues.
select 'create_order applique les campagnes' as element,
       case when position('promotion_apply_to_order' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end as etat
union all select 'paiement : part promotion retirée de la vente',
       case when position('promo_compensation' in pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end
union all select 'annulation : déclencheurs en place',
       case when (select count(*) from pg_trigger where tgname in ('trg_promotions_order_cancelled', 'trg_promotions_order_shop_cancelled')) = 2 then 'ok' else 'À VÉRIFIER' end
union all select 'aperçu et campagnes publiques',
       case when to_regprocedure('public.promotions_preview(jsonb)') is not null and to_regprocedure('public.public_active_promotions()') is not null then 'ok' else 'À VÉRIFIER' end;
