-- Retour arrière de docs/sql/securite-corrections.sql.
-- Remet les fonctions, politiques et réglages dans leur état du 12/11/2026.
-- Les codes de livraison sont recopiés dans les colonnes d'origine avant que
-- les anciennes fonctions soient rétablies. Les tables security_events et
-- ezial_private.delivery_codes sont CONSERVÉES (aucune donnée perdue).
-- À n'utiliser qu'en cas de problème. Rejouable.
begin;

drop trigger if exists trg_lock_shop_privileged_columns on public.shops;
drop trigger if exists trg_lock_delivery_stops_columns on public.delivery_stops;
drop trigger if exists trg_guard_order_shop_status on public.order_shops;
drop trigger if exists trg_a_hide_delivery_code on public.orders;
drop trigger if exists trg_a_hide_delivery_code on public.delivery_missions;

-- Codes recopiés dans les colonnes publiques (le verrou est suspendu le temps de la copie).
update public.orders o set delivery_code = c.code
  from ezial_private.delivery_codes c where c.order_id = o.id and o.delivery_code is null;
alter table public.delivery_missions disable trigger trg_lock_delivery_missions_identity;
update public.delivery_missions m set delivery_code = c.code
  from ezial_private.delivery_codes c where c.order_id = m.order_id and m.delivery_code is null;
alter table public.delivery_missions enable trigger trg_lock_delivery_missions_identity;

create or replace function public.lock_delivery_missions_identity_columns()
returns trigger
language plpgsql
as $function$
begin
  if new.order_id is distinct from old.order_id
     or new.pickup_code is distinct from old.pickup_code
     or new.delivery_code is distinct from old.delivery_code then
    raise exception 'delivery_missions.order_id/pickup_code/delivery_code cannot be changed after creation';
  end if;
  if old.driver_id is not null and new.driver_id is distinct from old.driver_id then
    raise exception 'delivery_missions.driver_id cannot be reassigned once set';
  end if;
  return new;
end;
$function$;
alter function public.lock_delivery_missions_identity_columns() security invoker;
alter function public.lock_delivery_missions_identity_columns() reset search_path;

create or replace function public.ensure_order_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text;
  v_has_delivery boolean;
begin
  select delivery_code into v_code
  from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;

  if not found then
    return null;
  end if;

  if v_code is not null then
    return v_code;
  end if;

  select exists (
    select 1 from public.order_shops where order_id = p_order_id and fulfillment_type = 'delivery'
  ) into v_has_delivery;

  if not v_has_delivery then
    return null;
  end if;

  v_code := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  update public.orders set delivery_code = v_code where id = p_order_id;
  return v_code;
end;
$function$;

create or replace function public.get_order_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text;
begin
  if not exists (select 1 from public.orders where id = p_order_id and customer_id = auth.uid()) then
    return null;
  end if;
  select delivery_code into v_code
  from public.delivery_missions
  where order_id = p_order_id
  order by created_at desc
  limit 1;
  return v_code;
end;
$function$;

create or replace function public.create_delivery_mission_when_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_all_ready boolean;
  v_mission_id uuid;
  v_stop record;
  v_stop_order integer := 0;
  v_code text;
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

  select coalesce(delivery_code, lpad(floor(random() * 9000 + 1000)::text, 4, '0'))
  into v_code
  from public.orders where id = new.order_id;

  update public.orders set delivery_code = v_code where id = new.order_id and delivery_code is null;

  insert into public.delivery_missions (order_id, status, delivery_code, driver_earning)
  values (new.order_id, 'available', v_code, 0)
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

create or replace function public.driver_complete_delivery(p_mission_id uuid, p_delivery_code text, p_proof_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare m public.delivery_missions;
begin
  select * into m from public.delivery_missions where id = p_mission_id for update;
  if m.id is null or m.driver_id is distinct from (select auth.uid()) then
    raise exception 'Mission introuvable.' using errcode = 'P0001';
  end if;
  if m.status = 'delivered' then return jsonb_build_object('alreadyDelivered', true); end if;
  if m.status <> 'out_for_delivery' then
    raise exception 'La livraison n''a pas été démarrée.' using errcode = 'P0001';
  end if;
  if m.delivery_code is null or trim(coalesce(p_delivery_code, '')) <> m.delivery_code then
    raise exception 'Code de livraison incorrect.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_proof_photo_path), '') = '' or split_part(p_proof_photo_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'Preuve photo manquante.' using errcode = 'P0001';
  end if;
  perform set_config('ezial.delivery_confirmed_by_server', 'on', true);
  update public.delivery_missions set status = 'delivered', delivered_at = now(), proof_photo_path = p_proof_photo_path where id = m.id;
  perform ezial_private.audit('driver', 'delivery_confirmed', 'delivery_mission', m.id, jsonb_build_object('order_id', m.order_id));
  return jsonb_build_object('delivered', true);
end;
$function$;

drop policy if exists "Drivers can view available or own missions" on public.delivery_missions;
create policy "Drivers can view available or own missions" on public.delivery_missions for select to authenticated
  using ((status = 'available') or (driver_id = auth.uid()));

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert with check (user_id = auth.uid());

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());

update storage.buckets set file_size_limit = null, allowed_mime_types = null
 where id in ('product-images', 'Shop-images', 'secure-photos');

alter table public.products drop constraint if exists products_category_format_check;
alter table public.products drop constraint if exists products_subcategory_format_check;

drop function if exists public.consume_api_quota(uuid, text, integer, integer);

alter function public.prevent_seller_status_change() reset search_path;
alter function public.lock_order_shops_identity_columns() reset search_path;
alter function public.lock_reviews_moderation_column() reset search_path;

commit;

-- ATTENTION : après ce retour arrière, les failles corrigées sont de nouveau
-- ouvertes (boutique « officielle » auto-déclarée, rémunération livreur
-- modifiable, code de livraison lisible et sans limite d'essais, statuts de
-- commande libres, avis sans achat, stockage sans limite). À ne garder que le
-- temps de corriger le problème rencontré.
select 'verrous retirés — FAILLES DE NOUVEAU OUVERTES' as verification,
       case when not exists (select 1 from pg_trigger where tgname in ('trg_lock_shop_privileged_columns', 'trg_lock_delivery_stops_columns', 'trg_guard_order_shop_status', 'trg_a_hide_delivery_code') and not tgisinternal) then 'ok' else 'ERREUR' end as resultat;
