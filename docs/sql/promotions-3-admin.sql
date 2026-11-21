-- ============================================================================
-- Ezial — Campagnes promotionnelles, phase 1 — MIGRATION 3 / 3 : ADMINISTRATION ET VENDEURS
-- Contrat : docs/promotions/contrat-phase1.md
--
-- QUOI (fonctions appelées par Ezial Admin et par l'espace vendeur) :
--   admin_promotions_list(), admin_promotion_save(p), admin_promotion_set_status(p_id, p_status),
--   admin_promotion_compensations(p_status), admin_mark_compensations_paid(p_ids, p_method, p_reference, p_note),
--   seller_promotion_compensations(p_shop_id). Pas de quartiers (livraison : toute la région de Dakar).
-- CONTRÔLE ADMIN : identique aux fonctions admin existantes (ligne dans public.admins) + double
--   authentification : si le compte a un facteur vérifié, la session doit être validée par le code (aal2).
-- Statistiques : commandes NON annulées seulement.
-- PRÉREQUIS : promotions-1-structure.sql (et promotions-2-commande.sql pour que des commandes utilisent les campagnes).
-- RELANÇABLE : oui. RETOUR ARRIÈRE : docs/sql/promotions-3-retour-arriere.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.promotions') is null then
    raise exception 'Exécutez d''abord docs/sql/promotions-1-structure.sql.';
  end if;
end $$;

create or replace function ezial_private.promotions_assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2'
     and exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified') then
    raise exception 'mfa_required' using errcode = '42501',
      detail = 'La double authentification doit être validée pour ce compte administrateur.';
  end if;
end $$;
revoke all on function ezial_private.promotions_assert_admin() from public;

-- Liste des campagnes avec cibles, quartiers et statistiques
create or replace function public.admin_promotions_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform ezial_private.promotions_assert_admin();
  with r as (
    select r.promotion_id, count(*) n, sum(r.product_discount) pd, sum(r.delivery_discount) dd, sum(r.ezial_cost) cost, sum(r.seller_funded) sf
      from public.promotion_redemptions r join public.orders o on o.id = r.order_id
     where r.status = 'counted' and o.status <> 'cancelled'
     group by 1),
  s as (
    select r.promotion_id, sum(os.subtotal) sales, sum(os.commission_amount) commissions
      from public.promotion_redemptions r join public.orders o on o.id = r.order_id join public.order_shops os on os.order_id = o.id
     where r.status = 'counted' and o.status <> 'cancelled' and os.status <> 'cancelled'
     group by 1)
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
           'targets', coalesce((select jsonb_agg(jsonb_build_object('target_type', t.target_type, 'target_ref', t.target_ref) order by t.target_type, t.target_ref)
                                  from public.promotion_targets t where t.promotion_id = p.id), '[]'::jsonb),
           'neighborhoods', '[]'::jsonb,
           'seller_shares', coalesce((select jsonb_agg(jsonb_build_object('shop_id', ss.shop_id, 'share_type', ss.share_type, 'share_value', ss.share_value,
                                        'agreed_note', ss.agreed_note) order by ss.shop_id) from public.promotion_seller_shares ss where ss.promotion_id = p.id), '[]'::jsonb),
           'stats', jsonb_build_object(
             'orders', coalesce(r.n, 0), 'product_discount', coalesce(r.pd, 0), 'delivery_discount', coalesce(r.dd, 0),
             'ezial_cost', coalesce(r.cost, 0), 'seller_funded', coalesce(r.sf, 0),
             'budget_remaining', case when p.budget_max is null then null else greatest(p.budget_max - p.budget_used, 0) end,
             'sales', round(coalesce(s.sales, 0)), 'commissions', round(coalesce(s.commissions, 0)),
             'ezial_net', round(coalesce(s.commissions, 0)) - coalesce(r.cost, 0)))
         order by p.created_at desc, p.id), '[]'::jsonb)
    into v
    from public.promotions p left join r on r.promotion_id = p.id left join s on s.promotion_id = p.id;
  return v;
end $$;

-- Création (id absent, statut « brouillon ») ou modification d'une campagne
create or replace function public.admin_promotion_save(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_old public.promotions; v_name text; v_code text; v_kind text; v_value numeric; v_max_discount integer;
  v_min integer; v_cap integer; v_start timestamptz; v_end timestamptz; v_audience text; v_max_total integer;
  v_max_customer integer; v_budget integer; t jsonb; v_type text; v_ref text; v_shop uuid; v_share_type text; v_share_value numeric;
begin
  perform ezial_private.promotions_assert_admin();
  if jsonb_typeof(p) <> 'object' then raise exception 'Données de campagne invalides.' using errcode = 'P0001'; end if;
  begin
    v_id := nullif(p->>'id', '')::uuid;
    v_value := coalesce(nullif(p->>'value', '')::numeric, 0);
    v_max_discount := nullif(p->>'max_discount', '')::integer;
    v_min := coalesce(nullif(p->>'min_amount', '')::integer, 0);
    v_cap := nullif(p->>'delivery_cap', '')::integer;
    v_start := nullif(p->>'starts_at', '')::timestamptz;
    v_end := nullif(p->>'ends_at', '')::timestamptz;
    v_max_total := nullif(p->>'max_uses_total', '')::integer;
    v_max_customer := nullif(p->>'max_uses_per_customer', '')::integer;
    v_budget := nullif(p->>'budget_max', '')::integer;
  exception when others then
    raise exception 'Une valeur numérique ou une date est invalide.' using errcode = 'P0001';
  end;
  if v_id is not null then
    select * into v_old from public.promotions where id = v_id for update;
    if v_old.id is null then raise exception 'Campagne introuvable.' using errcode = 'P0001'; end if;
    if v_old.status = 'ended' then raise exception 'Cette campagne est terminée : elle ne peut plus être modifiée.' using errcode = 'P0001'; end if;
  end if;

  v_name := btrim(coalesce(p->>'name', ''));
  if v_name = '' or length(v_name) > 120 then raise exception 'Donnez un nom à la campagne (120 caractères au plus).' using errcode = 'P0001'; end if;
  v_code := nullif(upper(btrim(coalesce(p->>'code', ''))), '');
  if v_code is not null and v_code !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'Le code doit compter 3 à 30 caractères : lettres, chiffres, tiret (-) ou tiret bas (_).' using errcode = 'P0001';
  end if;
  v_kind := p->>'kind';
  if v_kind is null or v_kind not in ('fixed', 'percent', 'free_delivery') then raise exception 'Type de campagne invalide.' using errcode = 'P0001'; end if;
  if v_kind = 'percent' and (v_value < 1 or v_value > 90) then raise exception 'Le pourcentage doit être compris entre 1 et 90.' using errcode = 'P0001'; end if;
  if v_kind = 'fixed' and (v_value <= 0 or v_value <> trunc(v_value)) then raise exception 'Le montant de la réduction doit être un nombre entier de FCFA supérieur à 0.' using errcode = 'P0001'; end if;
  if v_kind = 'free_delivery' then v_value := 0; end if;
  if v_kind <> 'percent' then v_max_discount := null; end if;
  if v_kind <> 'free_delivery' then v_cap := null; end if;
  if v_max_discount is not null and v_max_discount <= 0 then raise exception 'Le plafond de réduction doit être supérieur à 0.' using errcode = 'P0001'; end if;
  if v_cap is not null and v_cap <= 0 then raise exception 'Le plafond de livraison offerte doit être supérieur à 0.' using errcode = 'P0001'; end if;
  if v_min < 0 then raise exception 'Le minimum d''achat ne peut pas être négatif.' using errcode = 'P0001'; end if;
  if v_start is null or v_end is null then raise exception 'Indiquez les dates de début et de fin.' using errcode = 'P0001'; end if;
  if v_end <= v_start then raise exception 'La date de fin doit être après la date de début.' using errcode = 'P0001'; end if;
  v_audience := coalesce(nullif(p->>'audience', ''), 'all');
  if v_audience not in ('all', 'new_customers') then raise exception 'Public de la campagne invalide.' using errcode = 'P0001'; end if;
  if (v_max_total is not null and v_max_total <= 0) or (v_max_customer is not null and v_max_customer <= 0) or (v_budget is not null and v_budget <= 0) then
    raise exception 'Les limites d''utilisation et le budget doivent être supérieurs à 0.' using errcode = 'P0001';
  end if;
  if not (p ? 'max_uses_per_customer') then v_max_customer := coalesce(v_old.max_uses_per_customer, 1); end if;

  if v_id is null then
    insert into public.promotions (name, code, kind, value, max_discount, min_amount, delivery_cap, starts_at, ends_at, status, audience,
                                   max_uses_total, max_uses_per_customer, budget_max, created_by)
    values (v_name, v_code, v_kind, v_value, v_max_discount, v_min, v_cap, v_start, v_end, 'draft', v_audience,
            v_max_total, v_max_customer, v_budget, (select auth.uid()))
    returning id into v_id;   -- code déjà pris : erreur 23505 (contrainte d'unicité)
  else
    update public.promotions set name = v_name, code = v_code, kind = v_kind, value = v_value, max_discount = v_max_discount,
           min_amount = v_min, delivery_cap = v_cap, starts_at = v_start, ends_at = v_end, audience = v_audience,
           max_uses_total = v_max_total, max_uses_per_customer = v_max_customer, budget_max = v_budget
     where id = v_id;
    delete from public.promotion_targets where promotion_id = v_id;
    delete from public.promotion_seller_shares where promotion_id = v_id;
  end if;

  for t in select * from jsonb_array_elements(case when jsonb_typeof(p->'targets') = 'array' then p->'targets' else '[]'::jsonb end) loop
    v_type := coalesce(t->>'target_type', t->>'type');
    v_ref := btrim(coalesce(t->>'target_ref', t->>'ref', ''));
    if v_type is null or v_type not in ('product', 'shop', 'category', 'subcategory') or v_ref = '' then
      raise exception 'Cible de campagne invalide.' using errcode = 'P0001';
    end if;
    if v_type = 'product' then
      begin v_ref := v_ref::uuid::text; exception when others then raise exception 'Produit ciblé introuvable.' using errcode = 'P0001'; end;
      if not exists (select 1 from public.products pr where pr.id = v_ref::uuid) then raise exception 'Produit ciblé introuvable.' using errcode = 'P0001'; end if;
    elsif v_type = 'shop' then
      begin v_ref := v_ref::uuid::text; exception when others then raise exception 'Boutique ciblée introuvable.' using errcode = 'P0001'; end;
      if not exists (select 1 from public.shops sh where sh.id = v_ref::uuid) then raise exception 'Boutique ciblée introuvable.' using errcode = 'P0001'; end if;
    elsif v_type = 'subcategory' and v_ref !~ '^[^/]+/[^/]+$' then
      raise exception 'Sous-catégorie invalide (format attendu : categorie/sous-categorie).' using errcode = 'P0001';
    end if;
    insert into public.promotion_targets (promotion_id, target_type, target_ref) values (v_id, v_type, v_ref) on conflict do nothing;
  end loop;

  -- Parts vendeurs (facultatives) : l'envoi par l'administratrice vaut accord de la boutique (agreed = true).
  -- Réductions produits seulement : ignorées pour une livraison offerte.
  for t in select * from jsonb_array_elements(case when jsonb_typeof(p->'seller_shares') = 'array' then p->'seller_shares' else '[]'::jsonb end) loop
    begin
      v_shop := nullif(t->>'shop_id', '')::uuid;
      v_share_value := nullif(t->>'share_value', '')::numeric;
    exception when others then
      raise exception 'Part vendeur invalide.' using errcode = 'P0001';
    end;
    v_share_type := t->>'share_type';
    if v_shop is null or not exists (select 1 from public.shops sh where sh.id = v_shop) then
      raise exception 'Boutique de la part vendeur introuvable.' using errcode = 'P0001';
    end if;
    if v_share_type is null or v_share_type not in ('fixed', 'percent') then raise exception 'Type de part vendeur invalide.' using errcode = 'P0001'; end if;
    if v_share_type = 'percent' and (v_share_value is null or v_share_value < 1 or v_share_value > 100) then
      raise exception 'La part vendeur en pourcentage doit être comprise entre 1 et 100.' using errcode = 'P0001';
    end if;
    if v_share_type = 'fixed' and (v_share_value is null or v_share_value <= 0 or v_share_value <> trunc(v_share_value)) then
      raise exception 'La part vendeur fixe doit être un nombre entier de FCFA supérieur à 0.' using errcode = 'P0001';
    end if;
    if v_kind <> 'free_delivery' then
      insert into public.promotion_seller_shares (promotion_id, shop_id, share_type, share_value, agreed, agreed_note)
      values (v_id, v_shop, v_share_type, v_share_value, true, nullif(btrim(coalesce(t->>'agreed_note', '')), ''))
      on conflict (promotion_id, shop_id) do update set share_type = excluded.share_type, share_value = excluded.share_value, agreed_note = excluded.agreed_note;
    end if;
  end loop;

  perform ezial_private.audit('admin', 'promotion_saved', 'promotion', v_id, jsonb_build_object('name', v_name, 'code', v_code, 'kind', v_kind));
  return v_id;
end $$;

-- Activer, suspendre, terminer (« terminée » est définitif)
create or replace function public.admin_promotion_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.promotions;
begin
  perform ezial_private.promotions_assert_admin();
  if p_status is null or p_status not in ('active', 'paused', 'ended') then raise exception 'Statut invalide.' using errcode = 'P0001'; end if;
  select * into v from public.promotions where id = p_id for update;
  if v.id is null then raise exception 'Campagne introuvable.' using errcode = 'P0001'; end if;
  if v.status = 'ended' then raise exception 'Cette campagne est terminée : son statut est définitif.' using errcode = 'P0001'; end if;
  if p_status = 'active' and v.ends_at <= now() then raise exception 'La date de fin est déjà passée : modifiez-la avant d''activer la campagne.' using errcode = 'P0001'; end if;
  update public.promotions set status = p_status where id = p_id;
  perform ezial_private.audit('admin', 'promotion_status_' || p_status, 'promotion', p_id, jsonb_build_object('from', v.status));
end $$;

-- Compensations à reverser (ou payées / annulées)
create or replace function public.admin_promotion_compensations(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform ezial_private.promotions_assert_admin();
  if p_status is not null and p_status not in ('due', 'paid', 'cancelled') then raise exception 'Statut invalide.' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'order_id', c.order_id, 'order_number', o.order_number, 'shop_id', c.shop_id, 'shop_name', sh.name,
           'amount', c.amount, 'status', c.status, 'paid_at', c.paid_at, 'paid_method', c.paid_method, 'paid_reference', c.paid_reference,
           'note', c.note, 'created_at', c.created_at, 'promotion_id', r.promotion_id, 'promotion_name', pr.name,
           'seller_share', c.seller_share, 'gross_allocation', c.gross_allocation,
           'payout_orange_money', (select m.phone from public.seller_payout_methods m where m.shop_id = c.shop_id and m.provider = 'orange_money'
                                    and m.status = 'approved' order by m.reviewed_at desc nulls last, m.submitted_at desc limit 1),
           'payout_wave', (select m.phone from public.seller_payout_methods m where m.shop_id = c.shop_id and m.provider = 'wave'
                            and m.status = 'approved' order by m.reviewed_at desc nulls last, m.submitted_at desc limit 1),
           'order_status', o.status, 'order_shop_status', os.status,
           'awaiting_payment', coalesce(o.payment_required and o.paid_processed_at is null, false))
         order by c.created_at desc, c.id), '[]'::jsonb)
    into v
    from public.promotion_compensations c
    join public.promotion_redemptions r on r.id = c.redemption_id
    join public.promotions pr on pr.id = r.promotion_id
    join public.orders o on o.id = c.order_id
    join public.order_shops os on os.id = c.order_shop_id
    left join public.shops sh on sh.id = c.shop_id
   where p_status is null or c.status = p_status;
  return v;
end $$;

-- Paiement manuel d'une ou plusieurs compensations (toutes « à reverser », sinon rien n'est enregistré)
create or replace function public.admin_mark_compensations_paid(p_ids uuid[], p_method text, p_reference text, p_note text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_count integer; v_id uuid;
begin
  perform ezial_private.promotions_assert_admin();
  if p_method is null or p_method not in ('wave', 'orange_money', 'especes', 'virement', 'autre') then
    raise exception 'Moyen de paiement invalide.' using errcode = 'P0001';
  end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_ids, '{}'::uuid[])) x where x is not null;
  if v_ids is null then raise exception 'Choisissez au moins une compensation.' using errcode = 'P0001'; end if;
  perform 1 from public.promotion_compensations where id = any(v_ids) order by id for update;
  if (select count(*) from public.promotion_compensations where id = any(v_ids) and status = 'due') <> cardinality(v_ids) then
    raise exception 'Certaines compensations ne sont plus à reverser (déjà payées, annulées ou introuvables). Actualisez la liste.' using errcode = 'P0001';
  end if;
  update public.promotion_compensations
     set status = 'paid', paid_at = now(), paid_method = p_method, paid_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         paid_by = (select auth.uid()), note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   where id = any(v_ids) and status = 'due';
  get diagnostics v_count = row_count;
  foreach v_id in array v_ids loop
    perform ezial_private.audit('admin', 'promotion_compensation_paid', 'promotion_compensation', v_id,
      jsonb_build_object('method', p_method, 'reference', left(coalesce(p_reference, ''), 200)));
  end loop;
  return v_count;
end $$;

-- Vendeur : compensations de SA boutique
create or replace function public.seller_promotion_compensations(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = (select auth.uid())) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'order_number', o.order_number, 'amount', c.amount, 'status', c.status,
           'paid_at', c.paid_at, 'paid_method', c.paid_method, 'created_at', c.created_at) order by c.created_at desc, c.id), '[]'::jsonb)
    into v
    from public.promotion_compensations c join public.orders o on o.id = c.order_id
   where c.shop_id = p_shop_id;
  return v;
end $$;

revoke all on function public.admin_promotions_list(), public.admin_promotion_save(jsonb), public.admin_promotion_set_status(uuid, text),
  public.admin_promotion_compensations(text), public.admin_mark_compensations_paid(uuid[], text, text, text),
  public.seller_promotion_compensations(uuid) from public, anon;
grant execute on function public.admin_promotions_list(), public.admin_promotion_save(jsonb), public.admin_promotion_set_status(uuid, text),
  public.admin_promotion_compensations(text), public.admin_mark_compensations_paid(uuid[], text, text, text),
  public.seller_promotion_compensations(uuid) to authenticated, service_role;

commit;

-- Vérification : 6 attendu.
select count(*) as fonctions_creees from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('admin_promotions_list', 'admin_promotion_save', 'admin_promotion_set_status', 'admin_promotion_compensations',
   'admin_mark_compensations_paid', 'seller_promotion_compensations');
