-- Banc « Annulation par la boutique » : définitions EXACTES de la PRODUCTION (projet lkqezdrdbogtborgjvlw, lues en
-- lecture seule le 25 nov. 2026 par pg_get_functiondef ; fins de ligne CRLF ramenées à LF, empreinte md5 contrôlée par
-- 20-etat-production.sql). Chargé APRÈS le banc « promotions » (migrations 1 à 3 comprises) : remplace les copies
-- simplifiées de ce banc par le texte réel des fonctions et déclencheurs que la migration vendeur-annulation.sql
-- modifie ou sur lesquels elle s'appuie. Données FICTIVES uniquement.

-- Colonnes réelles de production absentes du banc (admin_notifications, livraison).
drop table public.admin_notifications cascade;
create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(), type text not null, message text not null, shop_id uuid, is_read boolean not null default false,
  created_at timestamptz not null default now(), order_id uuid, claim_id uuid, mission_id uuid, url text);
alter table public.delivery_missions
  add column pickup_code text, add column delivery_code text, add column proof_photo_path text, add column accepted_at timestamptz,
  add column picked_up_at timestamptz, add column delivered_at timestamptz, add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(), add column incident jsonb;
alter table public.delivery_missions add constraint delivery_missions_status_check
  check (status = any (array['available','accepted','picking_up','out_for_delivery','delivered','cancelled']));
alter table public.delivery_stops
  add column picked_up_at timestamptz, add column created_at timestamptz not null default now();
alter table public.delivery_stops add constraint delivery_stops_status_check check (status = any (array['pending','ready','picked_up']));
alter table public.shops add column if not exists neighborhood text, add column if not exists phone text;
create table if not exists public.seller_payouts (id uuid primary key default gen_random_uuid());
alter table public.seller_transactions add constraint seller_transactions_status_check check (status = any (array['pending','available','paid','cancelled']));

drop function if exists public.notify_admins(text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_order_id uuid DEFAULT NULL::uuid, p_claim_id uuid DEFAULT NULL::uuid, p_mission_id uuid DEFAULT NULL::uuid, p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications (user_id, type, title, body, url, order_id, claim_id, mission_id, shop_id)
  values (p_user_id, p_type, p_title, p_body, p_url, p_order_id, p_claim_id, p_mission_id, p_shop_id);
  perform public.push_notify(p_user_id, p_title, p_body, p_url);
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admins(p_type text, p_message text, p_url text, p_order_id uuid DEFAULT NULL::uuid, p_claim_id uuid DEFAULT NULL::uuid, p_mission_id uuid DEFAULT NULL::uuid, p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin record;
begin
  insert into public.admin_notifications (type, message, shop_id, order_id, claim_id, mission_id, url)
  values (p_type, p_message, p_shop_id, p_order_id, p_claim_id, p_mission_id, p_url);

  for v_admin in
    select id from public.profiles where role = 'admin' and not is_suspended
    union
    select user_id as id from public.admins
  loop
    perform public.push_notify(v_admin.id, 'EZIAL Admin', p_message, p_url);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.log_security_event(p_kind text, p_severity text, p_details jsonb DEFAULT '{}'::jsonb, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := coalesce(p_actor, (select auth.uid()));
begin
  -- Anti-saturation : au plus 30 événements du même type par acteur et par
  -- heure (un attaquant ne peut pas remplir la base en répétant ses essais).
  if (select count(*) from public.security_events e
       where e.kind = p_kind and e.actor_id is not distinct from v_actor
         and e.occurred_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.security_events (kind, severity, actor_id, details)
  values (p_kind,
          case when p_severity in ('critical', 'high', 'info') then p_severity else 'info' end,
          v_actor,
          coalesce(p_details, '{}'::jsonb));
exception when others then
  null;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.guard_order_shop_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  if new.status is not distinct from old.status then return new; end if;
  if v_uid is null or pg_trigger_depth() <> 1
     or exists (select 1 from public.admins a where a.user_id = v_uid) then
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

CREATE OR REPLACE FUNCTION public.create_delivery_mission_when_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_all_ready boolean;
  v_mission_id uuid;
  v_stop record;
  v_stop_order integer := 0;
begin
  if new.fulfillment_type <> 'delivery' or new.status <> 'ready' then
    return new;
  end if;

  if exists (select 1 from public.delivery_missions where order_id = new.order_id) then
    return new;
  end if;

  select bool_and(status = 'ready') into v_all_ready
  from public.order_shops
  where order_id = new.order_id and fulfillment_type = 'delivery';

  if not coalesce(v_all_ready, false) then
    return new;
  end if;

  perform ezial_private.ensure_delivery_code(new.order_id);

  insert into public.delivery_missions (order_id, status, driver_earning)
  values (new.order_id, 'available', 0)
  returning id into v_mission_id;

  for v_stop in
    select shop_id from public.order_shops
    where order_id = new.order_id and fulfillment_type = 'delivery'
    order by route_sequence
  loop
    v_stop_order := v_stop_order + 1;
    insert into public.delivery_stops (mission_id, shop_id, stop_order, status)
    values (v_mission_id, v_stop.shop_id, v_stop_order, 'pending');
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_customer_order_shop_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif new.status = 'cancelled' then
    perform public.notify_user(v_customer_id, 'order_cancelled', 'Commande annulée',
      'Une partie de votre commande a été annulée.', '/compte/commandes', new.order_id, null, null, new.shop_id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_seller_order_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner_id uuid;
begin
  if new.status is distinct from 'cancelled' then return new; end if;
  if public.order_is_unpaid(new.order_id) then return new; end if;
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_order_cancelled', 'Commande annulée', 'Une commande a été annulée.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_driver_mission_assigned_or_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.driver_id is null and new.driver_id is not null then
    perform public.notify_user(new.driver_id, 'driver_mission_assigned', 'Mission attribuée',
      'Une mission vous a été attribuée.', '/pro/driver', new.order_id, null, new.id);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.driver_id is not null then
    perform public.notify_user(new.driver_id, 'driver_mission_cancelled', 'Mission annulée',
      'Une mission qui vous était attribuée a été annulée.', '/pro/driver', new.order_id, null, new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lock_delivery_missions_identity_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_server boolean := coalesce(current_setting('ezial.delivery_confirmed_by_server', true), '') = 'on';
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

CREATE OR REPLACE FUNCTION ezial_private.lock_delivery_stops_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_blocked text[] := array[]::text[];
begin
  if v_uid is null or pg_trigger_depth() <> 1
     or exists (select 1 from public.admins a where a.user_id = v_uid) then
    return new;
  end if;
  if new.mission_id is distinct from old.mission_id then v_blocked := array_append(v_blocked, 'mission_id'); new.mission_id := old.mission_id; end if;
  if new.shop_id is distinct from old.shop_id then v_blocked := array_append(v_blocked, 'shop_id'); new.shop_id := old.shop_id; end if;
  if new.stop_order is distinct from old.stop_order then v_blocked := array_append(v_blocked, 'stop_order'); new.stop_order := old.stop_order; end if;
  if new.created_at is distinct from old.created_at then new.created_at := old.created_at; end if;
  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'picked_up') then
    v_blocked := array_append(v_blocked, 'status:' || coalesce(old.status, '') || '>' || coalesce(new.status, ''));
    new.status := old.status;
    new.picked_up_at := old.picked_up_at;
  end if;
  if array_length(v_blocked, 1) > 0 then
    perform ezial_private.log_security_event('privileged_column_attempt', 'high',
      jsonb_build_object('table', 'delivery_stops', 'stop_id', new.id, 'columns', to_jsonb(v_blocked)));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_admin_order_ready_for_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_number text;
  v_shop_name text;
begin
  if new.fulfillment_type = 'delivery' and new.status = 'ready' and (old.status is distinct from 'ready') then
    select order_number into v_order_number from public.orders where id = new.order_id;
    select name into v_shop_name from public.shops where id = new.shop_id;

    perform public.notify_admins(
      'order_ready_for_delivery',
      'Commande ' || coalesce(v_order_number, '') || ' prête à être livrée (' || coalesce(v_shop_name, 'boutique') || ')',
      '/pro/admin/commandes/' || new.order_id,
      new.order_id,
      null, null,
      new.shop_id
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_customer_mission_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer_id uuid;
begin
  if new.status not in ('out_for_delivery', 'delivered') then return new; end if;
  select customer_id into v_customer_id from public.orders where id = new.order_id;
  if v_customer_id is null then return new; end if;

  if new.status = 'out_for_delivery' then
    perform public.notify_user(v_customer_id, 'delivery_out', 'Livreur en route',
      'Votre livreur est en route.', '/compte/commandes', new.order_id, null, new.id);
  else
    perform public.notify_user(v_customer_id, 'delivery_done', 'Commande livrée',
      'Votre commande a été livrée. Bon shopping !', '/compte/commandes', new.order_id, null, new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.guard_delivery_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and coalesce(current_setting('ezial.delivery_confirmed_by_server', true), '') <> 'on'
     and not exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
     and (select auth.uid()) is not null then
    raise exception 'La livraison doit être confirmée avec le code du client.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- Déclencheurs de production (ordre alphabétique des noms = ordre d'exécution, comme en production).
CREATE OR REPLACE FUNCTION public.lock_order_shops_identity_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.order_id is distinct from old.order_id
     or new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id then
    raise exception 'order_shops.order_id/shop_id/customer_id cannot be changed after creation';
  end if;
  return new;
end;
$function$;
create trigger trg_lock_order_shops_identity before update on public.order_shops for each row execute function public.lock_order_shops_identity_columns();
create trigger trg_notify_admin_order_ready_for_delivery after update on public.order_shops for each row execute function public.trg_fn_notify_admin_order_ready_for_delivery();
create trigger trg_notify_customer_order_shop_status after update on public.order_shops for each row when (old.status is distinct from new.status) execute function public.notify_customer_order_shop_status();
create trigger trg_lock_delivery_stops_columns before update on public.delivery_stops for each row execute function ezial_private.lock_delivery_stops_columns();
create trigger trg_guard_delivery_confirmation before update on public.delivery_missions for each row
  when (new.status = 'delivered' and old.status is distinct from new.status) execute function ezial_private.guard_delivery_confirmation();
create trigger trg_lock_delivery_missions_identity before update on public.delivery_missions for each row execute function public.lock_delivery_missions_identity_columns();
create trigger trg_notify_customer_mission_status after update on public.delivery_missions for each row
  when (old.status is distinct from new.status) execute function public.notify_customer_mission_status();
create trigger trg_notify_driver_mission_assigned_or_cancelled after update on public.delivery_missions for each row
  when (old.driver_id is distinct from new.driver_id or old.status is distinct from new.status) execute function public.notify_driver_mission_assigned_or_cancelled();
create trigger trg_finance_mission_status after update on public.delivery_missions for each row
  when (old.status is distinct from new.status) execute function ezial_private.trg_finance_refresh();
