-- ============================================================================
-- Ezial — Annulation d'une commande par la boutique (« Je ne peux pas honorer cette commande »)
--
-- QUOI
--   1. public.seller_cancel_order_shop(order_shop_id, motif, note) : le vendeur annule SA part de commande
--      (order_shops), tant que le colis n'est pas récupéré par le livreur ni remis au client. Une seule
--      transaction, avec verrous : commande, part boutique, arrêt/mission du livreur, ventes, stock. Elle :
--        - refuse si l'appelant n'est pas le propriétaire (boutique non supprimée), si la part est déjà annulée
--          (réponse idempotente si c'est NOTRE annulation), si le colis est récupéré / remis, si la vente a déjà
--          été versée (ou est en cours de versement) ;
--        - passe la part en « cancelled » ; annule la vente vendeur de cette part (seller_transactions 'sale' ->
--          'cancelled' : aucune commission due) ;
--        - remet le stock des articles de CETTE boutique, une seule fois ;
--        - livraison : retire l'arrêt de la boutique de la mission ; annule la mission s'il ne reste aucun arrêt ;
--          prévient le livreur (mission annulée -> déclencheur existant ; arrêt retiré -> notification) ;
--          si la boutique annulée était la seule à ne pas être prête, la mission des autres boutiques est créée ;
--        - prévient le client (notification + push, mécanisme notify_user) : boutique, motif, et remboursement ;
--        - commande payée : crée la ligne « remboursement à effectuer » + une alerte administratrice
--          (notify_admins) ; commande non payée : le montant dû (orders.total_amount) est réduit de cette part,
--          aucune alerte, jamais d'encaissement pour une part annulée ; si c'était la dernière boutique, la
--          commande entière est annulée (promotion rendue par le déclencheur existant) ;
--        - journal d'audit (ezial_private.audit).
--   2. Table public.order_shop_cancellations (une ligne par part annulée) : motif, montant de la part,
--      remboursement (à effectuer / effectué, moyen, référence). Lecture : vendeur de la boutique, client de la
--      commande (colonnes limitées), administratrice. Aucune écriture directe.
--   3. Administration : admin_refunds_to_make(statut), admin_mark_refunded(id, moyen, référence, note),
--      admin_shop_cancellation_stats() (annulations vendeur sur 30 jours / total par boutique, sans pénalité).
--   4. Fonctions de production modifiées (texte relu en production le 25 nov. 2026, empreintes md5 contrôlées :
--      si une fonction a changé depuis, la migration s'arrête SANS RIEN MODIFIER) :
--        - ezial_private.guard_order_shop_status : accepte « cancelled » quand le drapeau transactionnel
--          ezial.seller_cancel = on (posé uniquement par seller_cancel_order_shop) ;
--        - public.lock_delivery_missions_identity_columns : même drapeau, pour annuler la mission ;
--        - public.notify_customer_order_shop_status / public.notify_seller_order_cancelled : pas de seconde
--          notification générique quand le drapeau est posé (le client reçoit le message détaillé) ;
--        - public.create_delivery_mission_when_ready : désormais ignore les parts annulées (avant, une part
--          annulée empêchait pour toujours la création de la mission des autres boutiques) ; la logique est
--          déplacée dans ezial_private.ensure_delivery_mission (même comportement pour les commandes sans annulation).
--   Rien d'autre : paiement Wave / Orange Money (fonctions et Edge Functions), commissions, frais de livraison
--   et create_order ne sont pas modifiés.
--
-- CALCUL DU MONTANT DE LA PART (part_amount) — ce que le client a payé pour cette boutique :
--     produits : order_shops.subtotal − order_shops.promo_allocation (réduction de campagne rattachée à la boutique)
--     + livraison (livraison − livraison offerte) et supplément urgent : seulement si cette part est livrée et
--       qu'aucune AUTRE part livrée n'est encore active (le trajet n'a plus lieu) ;
--     + emballage cadeau : seulement si c'est la dernière part active de la commande.
--   Plafonné à total_amount − (parts déjà annulées de la commande) : on ne rembourse jamais plus que payé.
--   Si d'autres parts livrées continuent, la livraison n'est PAS remboursée (le trajet est maintenu).
--
-- PRÉREQUIS : promotions-1/2 (colonnes promo_allocation, delivery_discount), orange-money-2 (stock_released_at).
-- AUCUN EFFET tant qu'aucune boutique n'utilise le bouton. RELANÇABLE : oui.
-- RETOUR ARRIÈRE : docs/sql/vendeur-annulation-retour.sql
-- ============================================================================
begin;

-- 0. Contrôles : objets attendus, fonctions de production inchangées. Rien n'est modifié si un contrôle échoue.
do $$
declare
  r record;
  v_def text;
begin
  if to_regclass('public.order_shops') is null or to_regclass('public.delivery_stops') is null
     or to_regclass('public.seller_transactions') is null or to_regclass('public.promotion_redemptions') is null then
    raise exception 'Tables attendues absentes (exécutez d''abord les migrations promotions) : rien n''a été modifié.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shops' and column_name = 'promo_allocation')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_discount') then
    raise exception 'Colonnes des campagnes absentes : rien n''a été modifié.';
  end if;
  for r in
    select * from (values
      ('ezial_private.guard_order_shop_status()',                 'e03ab3821815f9279fe46138f32684e3'),
      ('public.lock_delivery_missions_identity_columns()',       '654ce04cf4e5717e468eebf9ccb8d851'),
      ('public.notify_customer_order_shop_status()',              '414c8c049bb3114e9c724ac1c8c99285'),
      ('public.notify_seller_order_cancelled()',                  '56d7452528065a265adaeb3d59b0f5ae'),
      ('public.create_delivery_mission_when_ready()',             '0c24a1e9101db81a7d90001cfab339d8')
    ) t(sig, h)
  loop
    if to_regprocedure(r.sig) is null then raise exception 'Fonction % absente : rien n''a été modifié.', r.sig; end if;
    v_def := pg_get_functiondef(to_regprocedure(r.sig));
    -- déjà migrée (relance) : contient notre repère ; sinon doit être EXACTEMENT la définition de production
    if position('seller_cancel' in v_def) = 0 and position('ensure_delivery_mission' in v_def) = 0
       and md5(replace(v_def, chr(13), '')) <> r.h then
      raise exception 'La fonction % a changé depuis la lecture de production du 25 nov. 2026 : migration arrêtée, rien n''a été modifié.', r.sig;
    end if;
  end loop;
end $$;

-- 1. Copie des définitions d'origine (retour arrière). Seule la PREMIÈRE exécution enregistre.
create table if not exists ezial_private.vendeur_annulation_saved_functions (
  sig text primary key, def text not null, saved_at timestamptz not null default now());
revoke all on ezial_private.vendeur_annulation_saved_functions from public, anon, authenticated;
insert into ezial_private.vendeur_annulation_saved_functions (sig, def)
select v.sig, pg_get_functiondef(v.sig::regprocedure)
  from (values ('ezial_private.guard_order_shop_status()'), ('public.lock_delivery_missions_identity_columns()'),
               ('public.notify_customer_order_shop_status()'), ('public.notify_seller_order_cancelled()'),
               ('public.create_delivery_mission_when_ready()')) v(sig)
 where position('seller_cancel' in pg_get_functiondef(v.sig::regprocedure)) = 0
   and position('ensure_delivery_mission' in pg_get_functiondef(v.sig::regprocedure)) = 0
on conflict (sig) do nothing;

-- 2. Table des annulations par la boutique (une ligne par part annulée).
create table if not exists public.order_shop_cancellations (
  id uuid primary key default gen_random_uuid(),
  order_shop_id uuid not null unique references public.order_shops(id),
  order_id uuid not null references public.orders(id),
  shop_id uuid not null references public.shops(id),
  cancelled_by uuid,
  reason text not null check (reason in ('out_of_stock', 'item_unavailable', 'other')),
  note text check (note is null or char_length(note) <= 200),
  cancelled_at timestamptz not null default now(),
  order_was_paid boolean not null default false,
  part_amount integer not null default 0 check (part_amount >= 0),
  stock_released_at timestamptz,
  stop_removed boolean not null default false,
  mission_cancelled boolean not null default false,
  refund_status text not null default 'none' check (refund_status in ('none', 'to_refund', 'refunded')),
  refunded_at timestamptz,
  refund_method text check (refund_method is null or refund_method in ('orange_money', 'wave', 'especes', 'virement', 'autre')),
  refund_reference text,
  refund_note text,
  refunded_by uuid,
  check (refund_status <> 'refunded' or (refunded_at is not null and refund_method is not null))
);
create index if not exists order_shop_cancellations_shop_idx on public.order_shop_cancellations (shop_id, cancelled_at desc);
create index if not exists order_shop_cancellations_order_idx on public.order_shop_cancellations (order_id);
create index if not exists order_shop_cancellations_refund_idx on public.order_shop_cancellations (cancelled_at desc) where refund_status = 'to_refund';

alter table public.order_shop_cancellations enable row level security;
revoke all on public.order_shop_cancellations from public, anon, authenticated;
-- Colonnes lisibles par le vendeur et le client : jamais l'auteur, le moyen ni la référence de remboursement.
grant select (id, order_shop_id, order_id, shop_id, reason, note, cancelled_at, order_was_paid, part_amount,
              refund_status, refunded_at, mission_cancelled) on public.order_shop_cancellations to authenticated;

drop policy if exists order_shop_cancellations_seller_select on public.order_shop_cancellations;
create policy order_shop_cancellations_seller_select on public.order_shop_cancellations for select to authenticated
  using (exists (select 1 from public.shops s where s.id = order_shop_cancellations.shop_id and s.owner_id = (select auth.uid())));
drop policy if exists order_shop_cancellations_customer_select on public.order_shop_cancellations;
create policy order_shop_cancellations_customer_select on public.order_shop_cancellations for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_shop_cancellations.order_id and o.customer_id = (select auth.uid())));

-- 3. Drapeau transactionnel « ezial.seller_cancel » : fonctions de production adaptées (texte de production + ajout).
create or replace function ezial_private.guard_order_shop_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_uid uuid := (select auth.uid());
begin
  if new.status is not distinct from old.status then return new; end if;
  if v_uid is null or pg_trigger_depth() <> 1
     or exists (select 1 from public.admins a where a.user_id = v_uid) then
    return new;
  end if;
  -- Annulation par la boutique : seule seller_cancel_order_shop() pose ce drapeau (local à la transaction) et
  -- elle contrôle elle-même propriétaire, état de la livraison et versements.
  if new.status = 'cancelled' and coalesce(current_setting('ezial.seller_cancel', true), '') = 'on' then
    return new;
  end if;
  if not (
       (old.status = 'confirmed' and new.status = 'preparing')
    or (old.status = 'preparing' and new.status = 'ready' and new.fulfillment_type = 'delivery')
    or (old.status = 'preparing' and new.status = 'ready_for_pickup' and new.fulfillment_type = 'pickup')
    -- retrait déclaré par la boutique ; le versement reste soumis à la confirmation de l'administration
    or (old.status = 'ready_for_pickup' and new.status = 'picked_up' and new.fulfillment_type = 'pickup')
  ) then
    perform ezial_private.log_security_event('order_status_rejected', 'high',
      jsonb_build_object('order_shop_id', new.id, 'shop_id', new.shop_id, 'from', old.status, 'to', new.status));
    new.status := old.status;
  end if;
  return new;
end;
$function$;

create or replace function public.lock_delivery_missions_identity_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_server boolean := coalesce(current_setting('ezial.delivery_confirmed_by_server', true), '') = 'on';
  v_seller_cancel boolean := coalesce(current_setting('ezial.seller_cancel', true), '') = 'on';
  v_blocked text[] := array[]::text[];
begin
  if new.order_id is distinct from old.order_id
     or (new.pickup_code is distinct from old.pickup_code and new.pickup_code is not null)
     or (new.delivery_code is distinct from old.delivery_code and new.delivery_code is not null) then
    raise exception 'delivery_missions.order_id/pickup_code/delivery_code cannot be changed after creation';
  end if;
  if old.driver_id is not null and new.driver_id is distinct from old.driver_id then
    raise exception 'delivery_missions.driver_id cannot be reassigned once set';
  end if;

  -- Requête directe d'un utilisateur connecté qui n'est pas administrateur.
  if v_uid is not null and pg_trigger_depth() = 1
     and not exists (select 1 from public.admins a where a.user_id = v_uid) then
    if new.driver_earning is distinct from old.driver_earning then v_blocked := array_append(v_blocked, 'driver_earning'); new.driver_earning := old.driver_earning; end if;
    if new.created_at is distinct from old.created_at then new.created_at := old.created_at; end if;
    if not v_server then
      if new.proof_photo_path is distinct from old.proof_photo_path then v_blocked := array_append(v_blocked, 'proof_photo_path'); new.proof_photo_path := old.proof_photo_path; end if;
      if new.delivered_at is distinct from old.delivered_at then v_blocked := array_append(v_blocked, 'delivered_at'); new.delivered_at := old.delivered_at; end if;
      if new.status is distinct from old.status and not (
           (old.status = 'available' and new.status = 'accepted' and new.driver_id = v_uid)
        or (old.status = 'accepted' and new.status in ('picking_up', 'out_for_delivery'))
        or (old.status = 'picking_up' and new.status = 'out_for_delivery')
        -- annulation de la dernière boutique par seller_cancel_order_shop() (drapeau local à la transaction)
        or (v_seller_cancel and new.status = 'cancelled' and old.status in ('available', 'accepted', 'picking_up'))
      ) then
        v_blocked := array_append(v_blocked, 'status:' || coalesce(old.status, '') || '>' || coalesce(new.status, ''));
        new.status := old.status;
      end if;
    end if;
    if array_length(v_blocked, 1) > 0 then
      perform ezial_private.log_security_event('privileged_column_attempt', 'high',
        jsonb_build_object('table', 'delivery_missions', 'mission_id', new.id, 'columns', to_jsonb(v_blocked)));
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.notify_customer_order_shop_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.orders where id = new.order_id;
  if v_customer_id is null then return new; end if;

  if new.status = 'preparing' then
    perform public.notify_user(v_customer_id, 'order_preparing', 'Commande en préparation',
      'Votre commande est en cours de préparation.', '/compte/commandes', new.order_id, null, null, new.shop_id);
  elsif new.status = 'ready' then
    perform public.notify_user(v_customer_id, 'order_ready',
      case when new.fulfillment_type = 'delivery' then 'Commande prête pour la livraison' else 'Commande prête pour le retrait' end,
      case when new.fulfillment_type = 'delivery' then 'Votre commande est prête, un livreur va la récupérer.' else 'Votre commande vous attend en boutique.' end,
      '/compte/commandes', new.order_id, null, null, new.shop_id);
  -- Annulation par la boutique : seller_cancel_order_shop() envoie déjà le message détaillé (pas de doublon).
  elsif new.status = 'cancelled' and coalesce(current_setting('ezial.seller_cancel', true), '') <> 'on' then
    perform public.notify_user(v_customer_id, 'order_cancelled', 'Commande annulée',
      'Une partie de votre commande a été annulée.', '/compte/commandes', new.order_id, null, null, new.shop_id);
  end if;
  return new;
end;
$function$;

create or replace function public.notify_seller_order_cancelled()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_owner_id uuid;
begin
  if new.status is distinct from 'cancelled' then return new; end if;
  -- C'est la boutique elle-même qui annule : inutile de la prévenir de sa propre action.
  if coalesce(current_setting('ezial.seller_cancel', true), '') = 'on' then return new; end if;
  if public.order_is_unpaid(new.order_id) then return new; end if;
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_order_cancelled', 'Commande annulée', 'Une commande a été annulée.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

-- 4. Mission de livraison : les parts annulées sont ignorées. Même comportement qu'avant sans annulation.
create or replace function ezial_private.ensure_delivery_mission(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_all_ready boolean;
  v_mission_id uuid;
  v_stop record;
  v_stop_order integer := 0;
begin
  -- Verrou de la commande : une annulation de boutique et un passage « prête » simultanés se suivent l'un l'autre.
  perform 1 from public.orders where id = p_order_id for update;

  if exists (select 1 from public.delivery_missions where order_id = p_order_id) then
    return null;
  end if;

  select bool_and(status = 'ready') into v_all_ready
  from public.order_shops
  where order_id = p_order_id and fulfillment_type = 'delivery' and status <> 'cancelled';

  if not coalesce(v_all_ready, false) then
    return null;
  end if;

  perform ezial_private.ensure_delivery_code(p_order_id);

  insert into public.delivery_missions (order_id, status, driver_earning)
  values (p_order_id, 'available', 0)
  returning id into v_mission_id;

  for v_stop in
    select shop_id from public.order_shops
    where order_id = p_order_id and fulfillment_type = 'delivery' and status <> 'cancelled'
    order by route_sequence
  loop
    v_stop_order := v_stop_order + 1;
    insert into public.delivery_stops (mission_id, shop_id, stop_order, status)
    values (v_mission_id, v_stop.shop_id, v_stop_order, 'pending');
  end loop;

  return v_mission_id;
end;
$function$;
revoke all on function ezial_private.ensure_delivery_mission(uuid) from public, anon, authenticated;

create or replace function public.create_delivery_mission_when_ready()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.fulfillment_type <> 'delivery' or new.status <> 'ready' then
    return new;
  end if;
  perform ezial_private.ensure_delivery_mission(new.order_id);
  return new;
end;
$function$;

-- 5. La fonction du vendeur.
create or replace function public.seller_cancel_order_shop(p_order_shop_id uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
  os public.order_shops;
  o public.orders;
  sh public.shops;
  c public.order_shop_cancellations;
  st public.delivery_stops;
  m public.delivery_missions;
  v_paid boolean;
  v_others_active integer;
  v_others_delivery integer;
  v_part integer;
  v_prev integer;
  v_remaining integer;
  v_stock_rows integer := 0;
  v_tx record;
  v_refund boolean;
  v_stop_removed boolean := false;
  v_mission_cancelled boolean := false;
  v_stock_at timestamptz;
  v_reason_label text;
  v_body text;
  v_title text;
  v_paid_label text;
begin
  if v_uid is null then raise exception 'Connectez-vous pour annuler une commande.' using errcode = 'P0001'; end if;
  if p_reason is null or p_reason not in ('out_of_stock', 'item_unavailable', 'other') then
    raise exception 'Choisissez un motif d''annulation.' using errcode = 'P0001';
  end if;

  -- Propriétaire de la boutique (non supprimée) : même message qu'une part inconnue, rien ne fuit.
  select s.* into os from public.order_shops s where s.id = p_order_shop_id;
  if os.id is not null then select * into sh from public.shops where id = os.shop_id; end if;
  if os.id is null or sh.id is null or sh.owner_id is distinct from v_uid or sh.status = 'deleted' then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;

  -- Verrous, toujours dans le même ordre : commande, part boutique, arrêt, mission, ventes, stock.
  select * into o from public.orders where id = os.order_id for update;
  select * into os from public.order_shops where id = p_order_shop_id for update;

  -- Idempotent : annulation déjà faite par la boutique -> même résultat, aucun effet de plus.
  select * into c from public.order_shop_cancellations where order_shop_id = os.id;
  if c.id is not null then
    return jsonb_build_object('success', true, 'already', true, 'order_number', o.order_number,
      'refund_required', c.refund_status <> 'none', 'refund_amount', c.part_amount);
  end if;
  if os.status = 'cancelled' or o.status = 'cancelled' then
    raise exception 'Cette commande est déjà annulée.' using errcode = 'P0001';
  end if;
  if os.status not in ('confirmed', 'preparing', 'ready', 'ready_for_pickup') or o.status in ('delivered', 'out_for_delivery') then
    raise exception 'Cette commande a déjà été récupérée ou remise : elle ne peut plus être annulée.' using errcode = 'P0001';
  end if;

  -- Paiement : payée -> remboursement ; non payée -> la part sort du montant dû. Jamais pendant un paiement en cours.
  v_paid := o.payment_status = 'paid';
  if not v_paid then
    if o.payment_status <> 'pending' then
      raise exception 'Cette commande n''est plus active.' using errcode = 'P0001';
    end if;
    if o.payment_required and o.paid_processed_at is null then
      raise exception 'Cette commande attend encore le paiement du client : elle ne peut pas être annulée pour l''instant.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.payment_transactions t where t.order_id = o.id
                and (t.status in ('initiated', 'pending') or (t.status = 'superseded' and t.provider_closed_at is null))) then
      raise exception 'Un paiement est en cours pour cette commande. Réessayez dans quelques minutes.' using errcode = 'P0001';
    end if;
  end if;

  -- Livraison : le colis est-il déjà chez le livreur ?
  select ds.* into st from public.delivery_stops ds
    join public.delivery_missions dm on dm.id = ds.mission_id
   where dm.order_id = o.id and ds.shop_id = os.shop_id and dm.status <> 'cancelled'
   order by dm.created_at desc limit 1 for update of ds;
  if st.id is not null then
    select * into m from public.delivery_missions where id = st.mission_id for update;
    if st.status = 'picked_up' or m.status in ('out_for_delivery', 'delivered') then
      raise exception 'Le livreur a déjà récupéré ce colis : la commande ne peut plus être annulée.' using errcode = 'P0001';
    end if;
  end if;

  -- Ventes de cette part : jamais d'annulation d'une vente versée ou en cours de versement.
  for v_tx in select t.id, t.status, t.payout_id from public.seller_transactions t
               where t.order_shop_id = os.id and t.type = 'sale' and t.status <> 'cancelled' for update loop
    if v_tx.status = 'paid' or v_tx.payout_id is not null then
      raise exception 'Cette vente a déjà été versée (ou est en cours de versement) : annulation impossible. Contactez Ezial.' using errcode = 'P0001';
    end if;
  end loop;

  -- ===== À partir d'ici, tout est accepté : drapeau local à la transaction (déclencheurs de production) =====
  perform set_config('ezial.seller_cancel', 'on', true);

  select count(*) filter (where x.status <> 'cancelled'),
         count(*) filter (where x.status <> 'cancelled' and x.fulfillment_type = 'delivery')
    into v_others_active, v_others_delivery
    from public.order_shops x where x.order_id = o.id and x.id <> os.id;

  -- Montant de la part (voir l'en-tête) : produits − réduction de campagne rattachée, + livraison / urgent si
  -- le trajet disparaît, + emballage cadeau si c'est la dernière part ; plafonné à ce qui reste dû.
  v_part := greatest(round(os.subtotal)::integer - coalesce(os.promo_allocation, 0), 0)
    + case when os.fulfillment_type = 'delivery' and v_others_delivery = 0
           then greatest(coalesce(o.delivery_fee, 0) - coalesce(o.delivery_discount, 0), 0) + coalesce(o.urgent_fee, 0) else 0 end
    + case when v_others_active = 0 then coalesce(o.gift_wrap_fee, 0) else 0 end;
  select coalesce(sum(x.part_amount), 0)::integer into v_prev from public.order_shop_cancellations x where x.order_id = o.id;
  v_part := greatest(least(v_part, coalesce(o.total_amount, 0) - v_prev), 0);

  -- Part boutique annulée
  update public.order_shops set status = 'cancelled', updated_at = now() where id = os.id;

  -- Vente vendeur de cette part : annulée, aucune commission due
  for v_tx in select t.id from public.seller_transactions t where t.order_shop_id = os.id and t.type = 'sale' and t.status <> 'cancelled' loop
    update public.seller_transactions set status = 'cancelled', hold_reason = 'annulée par la boutique' where id = v_tx.id;
    perform ezial_private.audit('seller', 'sale_cancelled', 'seller_transaction', v_tx.id, jsonb_build_object('order_shop_id', os.id, 'by', 'seller'));
  end loop;

  -- Stock des articles de CETTE boutique, une seule fois (la ligne d'annulation ci-dessous est unique par part)
  if o.stock_released_at is null then
    perform 1 from public.product_variants pv
     where pv.id in (select oi.variant_id from public.order_items oi where oi.order_shop_id = os.id and oi.variant_id is not null)
     order by pv.id for update;
    update public.product_variants pv set stock = pv.stock + s.qty, updated_at = now()
      from (select oi.variant_id, sum(oi.quantity) as qty from public.order_items oi
             where oi.order_shop_id = os.id and oi.variant_id is not null group by oi.variant_id) s
     where pv.id = s.variant_id;
    get diagnostics v_stock_rows = row_count;
    v_stock_at := now();
  end if;

  -- Livraison : l'arrêt de la boutique sort de la mission ; plus aucun arrêt -> mission annulée
  if st.id is not null then
    delete from public.delivery_stops where id = st.id;
    v_stop_removed := true;
    if not exists (select 1 from public.delivery_stops where mission_id = m.id) then
      update public.delivery_missions set status = 'cancelled', updated_at = now() where id = m.id;   -- le livreur est prévenu par le déclencheur existant
      v_mission_cancelled := true;
    elsif m.driver_id is not null then
      perform public.notify_user(m.driver_id, 'driver_mission_updated', 'Une boutique a annulé',
        'La boutique ' || coalesce(sh.name, '') || ' a annulé sa commande ' || coalesce(o.order_number, '')
        || ' : ne passez plus la récupérer. Le reste de la mission continue.', '/pro/driver', o.id, null, m.id);
    end if;
  end if;

  -- Commande non payée : la part sort du montant dû ; commande payée : remboursement à faire
  v_refund := v_paid and v_part > 0;
  if not v_paid and v_part > 0 then
    update public.orders set total_amount = greatest(total_amount - v_part, 0), updated_at = now() where id = o.id;
  end if;

  -- Dernière part active : la commande entière est annulée (campagne rendue par le déclencheur existant)
  select count(*) into v_remaining from public.order_shops x where x.order_id = o.id and x.id <> os.id and x.status <> 'cancelled';
  if v_remaining = 0 then
    update public.orders set status = 'cancelled', payment_cancel_reason = 'seller_cancelled',
           payment_status = case when v_paid then payment_status else 'failed' end, updated_at = now() where id = o.id;
  end if;

  insert into public.order_shop_cancellations (order_shop_id, order_id, shop_id, cancelled_by, reason, note, order_was_paid, part_amount,
                                               stock_released_at, stop_removed, mission_cancelled, refund_status)
  values (os.id, o.id, os.shop_id, v_uid, p_reason, v_note, v_paid, v_part, v_stock_at, v_stop_removed, v_mission_cancelled,
          case when v_refund then 'to_refund' else 'none' end)
  returning * into c;

  -- Si la boutique annulée était la seule part livrée « pas prête », la mission des autres boutiques peut partir
  if os.fulfillment_type = 'delivery' then perform ezial_private.ensure_delivery_mission(o.id); end if;

  v_reason_label := case p_reason when 'out_of_stock' then 'rupture de stock' when 'item_unavailable' then 'article indisponible' else 'autre raison' end;
  v_paid_label := case o.payment_method when 'orange_money' then 'Orange Money' when 'wave' then 'Wave' when 'paypal' then 'PayPal' else coalesce(o.payment_method, '') end;

  -- Client : notification + push
  if o.customer_id is not null then
    v_title := case when v_remaining = 0 then 'Commande annulée' else 'Une boutique a annulé sa part' end;
    v_body := 'La boutique ' || coalesce(sh.name, '') || ' ne peut pas honorer votre commande ' || coalesce(o.order_number, '') || ' (' || v_reason_label || '). '
      || case when v_refund then 'Vous serez remboursé de ' || v_part || ' FCFA : Ezial vous contactera. '
              when not v_paid and v_part > 0 then 'Vous n''avez rien à payer pour cette part. '
              else '' end
      || case when v_remaining > 0 then 'Le reste de votre commande continue.' else '' end;
    perform public.notify_user(o.customer_id, 'order_cancelled', v_title, btrim(v_body),
      '/compte/commande/' || coalesce(o.order_number, ''), o.id, null, null, os.shop_id);
  end if;

  -- Administratrice : remboursement à effectuer
  if v_refund then
    perform public.notify_admins('refund_to_make',
      'Remboursement à effectuer : ' || v_part || ' FCFA, commande ' || coalesce(o.order_number, '') || ' (boutique ' || coalesce(sh.name, '') || ', '
      || v_paid_label || ')', '/pro/admin/remboursements', o.id, null, null, os.shop_id);
  end if;

  perform ezial_private.audit('seller', 'order_shop_cancelled_by_seller', 'order_shop', os.id,
    jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'shop_id', os.shop_id, 'reason', p_reason, 'paid', v_paid,
                       'part_amount', v_part, 'refund', v_refund, 'stock_rows', v_stock_rows, 'stop_removed', v_stop_removed,
                       'mission_cancelled', v_mission_cancelled, 'order_cancelled', v_remaining = 0));

  perform set_config('ezial.seller_cancel', '', true);
  return jsonb_build_object('success', true, 'already', false, 'order_number', o.order_number, 'refund_required', v_refund,
    'refund_amount', v_part, 'order_cancelled', v_remaining = 0, 'mission_cancelled', v_mission_cancelled);
end;
$function$;
revoke all on function public.seller_cancel_order_shop(uuid, text, text) from public, anon;
grant execute on function public.seller_cancel_order_shop(uuid, text, text) to authenticated;

-- 6. Administration (vérification de la ligne « admins » comme les autres fonctions admin ; la double
--    authentification est imposée au niveau de la requête par ezial_pre_request).
create or replace function public.admin_refunds_to_make(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('to_refund', 'refunded') then
    raise exception 'Statut invalide.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'cancelled_at') desc) from (
      select jsonb_build_object(
        'id', c.id, 'order_id', c.order_id, 'order_number', o.order_number, 'shop_id', c.shop_id, 'shop_name', s.name,
        'amount', c.part_amount, 'payment_method', o.payment_method,
        'payment_reference', (select coalesce(pt.provider_reference, pt.provider_transaction_id) from public.payment_transactions pt where pt.order_id = o.id and pt.status = 'confirmed' limit 1),
        'customer_name', btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), 'customer_phone', o.phone,
        'reason', c.reason, 'note', c.note, 'cancelled_at', c.cancelled_at, 'refund_status', c.refund_status,
        'refunded_at', c.refunded_at, 'refund_method', c.refund_method, 'refund_reference', c.refund_reference, 'refund_note', c.refund_note) as row
      from public.order_shop_cancellations c
      join public.orders o on o.id = c.order_id
      left join public.shops s on s.id = c.shop_id
      where c.refund_status <> 'none' and (p_status is null or c.refund_status = p_status)
      order by c.cancelled_at desc limit 500
    ) q), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_mark_refunded(p_id uuid, p_method text, p_reference text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare c public.order_shop_cancellations;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('orange_money', 'wave', 'especes', 'virement', 'autre') then
    raise exception 'Choisissez le moyen utilisé pour le remboursement.' using errcode = 'P0001';
  end if;
  select * into c from public.order_shop_cancellations where id = p_id for update;
  if c.id is null or c.refund_status = 'none' then raise exception 'Remboursement introuvable.' using errcode = 'P0001'; end if;
  if c.refund_status = 'refunded' then
    return jsonb_build_object('success', true, 'already', true, 'refunded_at', c.refunded_at);   -- idempotent
  end if;
  update public.order_shop_cancellations
     set refund_status = 'refunded', refunded_at = now(), refund_method = p_method,
         refund_reference = nullif(left(btrim(coalesce(p_reference, '')), 120), ''),
         refund_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), refunded_by = (select auth.uid())
   where id = c.id returning * into c;
  update public.admin_notifications set is_read = true
   where type = 'refund_to_make' and order_id = c.order_id and shop_id is not distinct from c.shop_id and not is_read;
  perform ezial_private.audit('admin', 'refund_marked_done', 'order_shop_cancellation', c.id,
    jsonb_build_object('order_id', c.order_id, 'amount', c.part_amount, 'method', p_method));
  return jsonb_build_object('success', true, 'already', false, 'refunded_at', c.refunded_at);
end;
$function$;

create or replace function public.admin_shop_cancellation_stats()
returns table (shop_id uuid, last_30_days integer, total integer, last_cancelled_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  return query
    select c.shop_id, (count(*) filter (where c.cancelled_at > now() - interval '30 days'))::integer, count(*)::integer, max(c.cancelled_at)
      from public.order_shop_cancellations c group by c.shop_id;
end;
$function$;

revoke all on function public.admin_refunds_to_make(text) from public, anon;
revoke all on function public.admin_mark_refunded(uuid, text, text, text) from public, anon;
revoke all on function public.admin_shop_cancellation_stats() from public, anon;
grant execute on function public.admin_refunds_to_make(text) to authenticated;
grant execute on function public.admin_mark_refunded(uuid, text, text, text) to authenticated;
grant execute on function public.admin_shop_cancellation_stats() to authenticated;

commit;

-- VÉRIFICATION (résultat attendu : tout « ok »)
select 'table order_shop_cancellations' as element,
       case when to_regclass('public.order_shop_cancellations') is not null
             and (select relrowsecurity from pg_class where oid = 'public.order_shop_cancellations'::regclass) then 'ok' else 'À VÉRIFIER' end as etat
union all select 'fonction du vendeur (droits : connecté seulement)',
       case when has_function_privilege('authenticated', 'public.seller_cancel_order_shop(uuid,text,text)', 'execute')
             and not has_function_privilege('anon', 'public.seller_cancel_order_shop(uuid,text,text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all select 'fonctions admin (droits : connecté seulement)',
       case when has_function_privilege('authenticated', 'public.admin_mark_refunded(uuid,text,text,text)', 'execute')
             and not has_function_privilege('anon', 'public.admin_mark_refunded(uuid,text,text,text)', 'execute')
             and not has_function_privilege('anon', 'public.admin_refunds_to_make(text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all select 'drapeau d''annulation dans les 5 fonctions de production',
       case when position('seller_cancel' in pg_get_functiondef('ezial_private.guard_order_shop_status()'::regprocedure)) > 0
             and position('seller_cancel' in pg_get_functiondef('public.lock_delivery_missions_identity_columns()'::regprocedure)) > 0
             and position('seller_cancel' in pg_get_functiondef('public.notify_customer_order_shop_status()'::regprocedure)) > 0
             and position('seller_cancel' in pg_get_functiondef('public.notify_seller_order_cancelled()'::regprocedure)) > 0
             and position('ensure_delivery_mission' in pg_get_functiondef('public.create_delivery_mission_when_ready()'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end;
