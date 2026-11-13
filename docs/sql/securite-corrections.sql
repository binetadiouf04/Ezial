-- Ezial — corrections de sécurité (audit du 12 novembre 2026).
-- Une seule transaction, rejouable, aucune donnée supprimée.
--   1. Journal des événements de sécurité (security_events).
--   2. Boutiques : un vendeur ne peut plus se déclarer « officielle » ni
--      modifier les champs réservés ; une boutique créée par un client
--      démarre toujours en brouillon.
--   3. Missions et arrêts de livraison : rémunération et champs réservés
--      verrouillés, seules les étapes normales sont acceptées.
--   4. Commandes : le vendeur ne peut faire avancer une commande que par les
--      étapes prévues.
--   5. Codes de livraison : déplacés dans une table privée, illisibles par le
--      livreur ; blocage après 5 codes incorrects ; missions disponibles
--      visibles des seuls livreurs.
--   6. Avis : réservés aux clients ayant reçu le produit.
--   7. Stockage : types de fichiers et taille maximale imposés.
--   8. Produits : format des catégories contrôlé.
--   9. Limite d'appels par client pour le calcul des frais de livraison.
-- Retour arrière : docs/sql/securite-corrections-retour-arriere.sql
begin;

-- =====================================================================
-- 1. Journal des événements de sécurité
-- =====================================================================
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  kind text not null,
  severity text not null default 'info' check (severity in ('critical', 'high', 'info')),
  actor_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index if not exists security_events_time_idx on public.security_events (occurred_at desc);
create index if not exists security_events_kind_idx on public.security_events (kind, occurred_at desc);
create index if not exists security_events_actor_idx on public.security_events (actor_id, kind, occurred_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
drop policy if exists security_events_admin_select on public.security_events;
create policy security_events_admin_select on public.security_events for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- La journalisation ne bloque jamais l'opération en cours.
create or replace function ezial_private.log_security_event(p_kind text, p_severity text, p_details jsonb default '{}'::jsonb, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
revoke all on function ezial_private.log_security_event(text, text, jsonb, uuid) from public, anon, authenticated;

-- =====================================================================
-- 2. Boutiques : champs réservés à l'administration
-- =====================================================================
create or replace function ezial_private.lock_shop_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_blocked text[] := array[]::text[];
begin
  -- Sans session (inscription, tâches planifiées, éditeur SQL, clé serveur) : rien à verrouiller.
  if v_uid is null then return new; end if;
  v_is_admin := exists (select 1 from public.admins a where a.user_id = v_uid);

  if tg_op = 'INSERT' then
    if v_is_admin then return new; end if;
    if coalesce(new.is_official, false) then v_blocked := array_append(v_blocked, 'is_official'); new.is_official := false; end if;
    if new.status is distinct from 'draft' then
      if new.status in ('active', 'paused') then v_blocked := array_append(v_blocked, 'status'); end if;
      new.status := 'draft';
    end if;
    if new.active_product_limit is distinct from 25 then v_blocked := array_append(v_blocked, 'active_product_limit'); new.active_product_limit := 25; end if;
    if new.pin_hash is not null then v_blocked := array_append(v_blocked, 'pin_hash'); new.pin_hash := null; end if;
    if new.suspension_reason is not null then new.suspension_reason := null; end if;
  else
    if v_is_admin then
      if new.is_official is distinct from old.is_official then
        perform ezial_private.log_security_event('shop_official_changed', 'critical',
          jsonb_build_object('shop_id', new.id, 'shop_name', new.name, 'is_official', new.is_official));
      end if;
      return new;
    end if;
    if new.is_official is distinct from old.is_official then v_blocked := array_append(v_blocked, 'is_official'); new.is_official := old.is_official; end if;
    if new.active_product_limit is distinct from old.active_product_limit then v_blocked := array_append(v_blocked, 'active_product_limit'); new.active_product_limit := old.active_product_limit; end if;
    if new.owner_id is distinct from old.owner_id then v_blocked := array_append(v_blocked, 'owner_id'); new.owner_id := old.owner_id; end if;
    if new.pin_hash is distinct from old.pin_hash then v_blocked := array_append(v_blocked, 'pin_hash'); new.pin_hash := old.pin_hash; end if;
    if new.suspension_reason is distinct from old.suspension_reason then v_blocked := array_append(v_blocked, 'suspension_reason'); new.suspension_reason := old.suspension_reason; end if;
    if new.created_at is distinct from old.created_at then new.created_at := old.created_at; end if;
  end if;

  if array_length(v_blocked, 1) > 0 then
    perform ezial_private.log_security_event('privileged_column_attempt', 'high',
      jsonb_build_object('table', 'shops', 'shop_id', new.id, 'columns', to_jsonb(v_blocked), 'operation', tg_op));
  end if;
  return new;
end;
$$;
revoke all on function ezial_private.lock_shop_privileged_columns() from public, anon, authenticated;
drop trigger if exists trg_lock_shop_privileged_columns on public.shops;
create trigger trg_lock_shop_privileged_columns before insert or update on public.shops
  for each row execute function ezial_private.lock_shop_privileged_columns();

-- =====================================================================
-- 3. Missions et arrêts de livraison
-- =====================================================================
-- Remplace l'ancien verrou (identité de la mission) et y ajoute : rémunération,
-- preuve, date de livraison et étapes autorisées pour le livreur. Les codes
-- peuvent seulement être vidés (ils vivent désormais dans une table privée).
create or replace function public.lock_delivery_missions_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function ezial_private.lock_delivery_stops_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
revoke all on function ezial_private.lock_delivery_stops_columns() from public, anon, authenticated;
drop trigger if exists trg_lock_delivery_stops_columns on public.delivery_stops;
create trigger trg_lock_delivery_stops_columns before update on public.delivery_stops
  for each row execute function ezial_private.lock_delivery_stops_columns();

-- =====================================================================
-- 4. Commandes : étapes autorisées pour le vendeur
-- =====================================================================
create or replace function ezial_private.guard_order_shop_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  ) then
    perform ezial_private.log_security_event('order_status_rejected', 'high',
      jsonb_build_object('order_shop_id', new.id, 'shop_id', new.shop_id, 'from', old.status, 'to', new.status));
    new.status := old.status;
  end if;
  return new;
end;
$$;
revoke all on function ezial_private.guard_order_shop_status() from public, anon, authenticated;
drop trigger if exists trg_guard_order_shop_status on public.order_shops;
create trigger trg_guard_order_shop_status before update on public.order_shops
  for each row execute function ezial_private.guard_order_shop_status();

-- =====================================================================
-- 5. Codes de livraison : table privée, compteur d'échecs
-- =====================================================================
create table if not exists ezial_private.delivery_codes (
  order_id uuid primary key,
  code text not null,
  failed_attempts integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table ezial_private.delivery_codes enable row level security;
revoke all on ezial_private.delivery_codes from public, anon, authenticated;

create or replace function ezial_private.ensure_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_code text; v_bytes bytea;
begin
  select code into v_code from ezial_private.delivery_codes where order_id = p_order_id;
  if v_code is not null then return v_code; end if;
  v_bytes := extensions.gen_random_bytes(2);
  v_code := (1000 + ((get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1)) % 9000))::text;
  insert into ezial_private.delivery_codes (order_id, code) values (p_order_id, v_code)
  on conflict (order_id) do nothing;
  select code into v_code from ezial_private.delivery_codes where order_id = p_order_id;
  return v_code;
end;
$$;
revoke all on function ezial_private.ensure_delivery_code(uuid) from public, anon, authenticated;

-- Tout code écrit dans les colonnes publiques est déplacé dans la table privée
-- (une fonction par table : la commande est identifiée par id, la mission
-- par order_id).
create or replace function ezial_private.hide_order_delivery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_code is not null then
    insert into ezial_private.delivery_codes (order_id, code) values (new.id, new.delivery_code)
    on conflict (order_id) do nothing;
    new.delivery_code := null;
  end if;
  return new;
end;
$$;
revoke all on function ezial_private.hide_order_delivery_code() from public, anon, authenticated;

create or replace function ezial_private.hide_mission_delivery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_code is not null then
    insert into ezial_private.delivery_codes (order_id, code) values (new.order_id, new.delivery_code)
    on conflict (order_id) do nothing;
    new.delivery_code := null;
  end if;
  return new;
end;
$$;
revoke all on function ezial_private.hide_mission_delivery_code() from public, anon, authenticated;
drop function if exists ezial_private.hide_delivery_code() cascade;

-- Codes existants : copiés avant que les colonnes publiques soient vidées.
insert into ezial_private.delivery_codes (order_id, code)
select o.id, o.delivery_code from public.orders o where o.delivery_code is not null
on conflict (order_id) do nothing;
insert into ezial_private.delivery_codes (order_id, code)
select m.order_id, m.delivery_code from public.delivery_missions m where m.delivery_code is not null
on conflict (order_id) do nothing;

drop trigger if exists trg_a_hide_delivery_code on public.orders;
create trigger trg_a_hide_delivery_code before insert or update on public.orders
  for each row execute function ezial_private.hide_order_delivery_code();
drop trigger if exists trg_a_hide_delivery_code on public.delivery_missions;
create trigger trg_a_hide_delivery_code before insert or update on public.delivery_missions
  for each row execute function ezial_private.hide_mission_delivery_code();

update public.orders set delivery_code = null where delivery_code is not null;
update public.delivery_missions set delivery_code = null where delivery_code is not null;

-- Le client obtient son code (créé au besoin) ; jamais le livreur.
create or replace function public.ensure_order_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.customer_id = (select auth.uid())) then
    return null;
  end if;
  if not exists (select 1 from public.order_shops os where os.order_id = p_order_id and os.fulfillment_type = 'delivery') then
    return null;
  end if;
  return ezial_private.ensure_delivery_code(p_order_id);
end;
$$;

create or replace function public.get_order_delivery_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_code text;
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.customer_id = (select auth.uid())) then
    return null;
  end if;
  select c.code into v_code from ezial_private.delivery_codes c where c.order_id = p_order_id;
  return v_code;
end;
$$;

-- Création de la mission : même logique qu'avant, le code reste privé.
create or replace function public.create_delivery_mission_when_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Confirmation de livraison : le serveur compare le code, compte les échecs
-- (blocage de 15 minutes tous les 5 codes incorrects) et les journalise.
-- Un code incorrect renvoie une réponse (pas une exception) pour que le
-- compteur soit bien enregistré.
create or replace function public.driver_complete_delivery(p_mission_id uuid, p_delivery_code text, p_proof_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.delivery_missions;
  c ezial_private.delivery_codes;
  v_uid uuid := (select auth.uid());
  v_given text := regexp_replace(coalesce(p_delivery_code, ''), '\s', '', 'g');
  v_fail integer;
  v_max constant integer := 5;
  v_locked boolean;
begin
  select * into m from public.delivery_missions where id = p_mission_id for update;
  if m.id is null or m.driver_id is distinct from v_uid then
    raise exception 'Mission introuvable.' using errcode = 'P0001';
  end if;
  if m.status = 'delivered' then return jsonb_build_object('alreadyDelivered', true); end if;
  if m.status <> 'out_for_delivery' then
    raise exception 'La livraison n''a pas été démarrée.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_proof_photo_path), '') = '' or split_part(p_proof_photo_path, '/', 1) <> v_uid::text then
    raise exception 'Preuve photo manquante.' using errcode = 'P0001';
  end if;

  select * into c from ezial_private.delivery_codes where order_id = m.order_id for update;
  if c.order_id is null then
    raise exception 'Code de livraison indisponible. Contactez Ezial.' using errcode = 'P0001';
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    return jsonb_build_object('delivered', false, 'lockedUntil', c.locked_until,
      'error', 'Trop de codes incorrects. Réessayez dans quelques minutes ou contactez Ezial.');
  end if;

  if v_given = '' or v_given <> c.code then
    v_fail := c.failed_attempts + 1;
    v_locked := (v_fail % v_max) = 0;
    update ezial_private.delivery_codes
       set failed_attempts = v_fail, last_failed_at = now(),
           locked_until = case when v_locked then now() + interval '15 minutes' else null end
     where order_id = m.order_id;
    perform ezial_private.log_security_event(
      case when v_locked then 'delivery_code_locked' else 'delivery_code_failed' end,
      case when v_locked then 'high' else 'info' end,
      jsonb_build_object('mission_id', m.id, 'order_id', m.order_id, 'failed_attempts', v_fail));
    if v_locked then
      return jsonb_build_object('delivered', false, 'lockedUntil', now() + interval '15 minutes',
        'error', 'Trop de codes incorrects. Réessayez dans 15 minutes ou contactez Ezial.');
    end if;
    return jsonb_build_object('delivered', false, 'attemptsLeft', v_max - (v_fail % v_max),
      'error', 'Code de livraison incorrect.');
  end if;

  perform set_config('ezial.delivery_confirmed_by_server', 'on', true);
  update public.delivery_missions
     set status = 'delivered', delivered_at = now(), proof_photo_path = p_proof_photo_path
   where id = m.id;
  perform ezial_private.audit('driver', 'delivery_confirmed', 'delivery_mission', m.id, jsonb_build_object('order_id', m.order_id));
  return jsonb_build_object('delivered', true);
end;
$$;
revoke all on function public.driver_complete_delivery(uuid, text, text) from public, anon;
grant execute on function public.driver_complete_delivery(uuid, text, text) to authenticated;

-- Fonctions de déclencheur : jamais appelables directement.
revoke all on function public.lock_delivery_missions_identity_columns() from public, anon, authenticated;
revoke all on function public.create_delivery_mission_when_ready() from public, anon, authenticated;

-- Missions disponibles : visibles des seuls livreurs actifs (plus de tout compte connecté).
drop policy if exists "Drivers can view available or own missions" on public.delivery_missions;
create policy "Drivers can view available or own missions" on public.delivery_missions for select to authenticated
  using (
    driver_id = (select auth.uid())
    or (status = 'available' and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'driver' and not coalesce(p.is_suspended, false)))
  );

-- =====================================================================
-- 6. Avis : réservés aux clients ayant reçu le produit
-- =====================================================================
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.order_items oi
        join public.order_shops os on os.id = oi.order_shop_id
        join public.orders o on o.id = os.order_id
       where oi.product_id = reviews.product_id
         and o.customer_id = (select auth.uid())
         and os.status in ('delivered', 'collected'))
  );

-- Un avis existant ne peut pas être déplacé vers un produit non reçu.
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.order_items oi
        join public.order_shops os on os.id = oi.order_shop_id
        join public.orders o on o.id = os.order_id
       where oi.product_id = reviews.product_id
         and o.customer_id = (select auth.uid())
         and os.status in ('delivered', 'collected'))
  );

-- =====================================================================
-- 7. Stockage : types et tailles imposés par le serveur
-- =====================================================================
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/quicktime', 'video/webm']
 where id = 'product-images';
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
 where id in ('Shop-images', 'secure-photos');

-- =====================================================================
-- 8. Produits : format des catégories (utilisées dans les adresses du site)
-- =====================================================================
alter table public.products drop constraint if exists products_category_format_check;
alter table public.products add constraint products_category_format_check
  check (category is null or category ~ '^[a-z0-9_-]*$') not valid;
alter table public.products validate constraint products_category_format_check;
alter table public.products drop constraint if exists products_subcategory_format_check;
alter table public.products add constraint products_subcategory_format_check
  check (subcategory is null or subcategory ~ '^[a-z0-9_-]*$') not valid;
alter table public.products validate constraint products_subcategory_format_check;

-- =====================================================================
-- 9. Limite d'appels par client (calcul des frais de livraison)
-- =====================================================================
create table if not exists ezial_private.api_quotas (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (user_id, bucket)
);
alter table ezial_private.api_quotas enable row level security;
revoke all on ezial_private.api_quotas from public, anon, authenticated;

-- Vrai si l'appel est autorisé (et compté) ; faux si le client a dépassé
-- p_max appels dans la fenêtre. Réservée à la clé serveur (fonctions Edge).
create or replace function public.consume_api_quota(p_user_id uuid, p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_used integer;
begin
  if p_user_id is null or coalesce(p_bucket, '') = '' or coalesce(p_max, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    return false;
  end if;
  insert into ezial_private.api_quotas as q (user_id, bucket, window_start, used)
  values (p_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when q.window_start <= now() - make_interval(secs => p_window_seconds) then now() else q.window_start end,
        used = case when q.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else q.used + 1 end
  returning used into v_used;
  if v_used > p_max then
    if v_used = p_max + 1 then
      perform ezial_private.log_security_event('api_quota_exceeded', 'info',
        jsonb_build_object('bucket', p_bucket, 'max', p_max), p_user_id);
    end if;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.consume_api_quota(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_quota(uuid, text, integer, integer) to service_role;

-- Fonctions de déclencheur existantes : chemin de recherche figé.
alter function public.prevent_seller_status_change() set search_path = public;
alter function public.lock_order_shops_identity_columns() set search_path = public;
alter function public.lock_reviews_moderation_column() set search_path = public;

commit;

-- Vérification : 9 lignes « ok » attendues.
select 'journal des événements de sécurité' as element,
       case when to_regclass('public.security_events') is not null
             and not has_table_privilege('authenticated', 'public.security_events', 'INSERT') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'boutiques : champs réservés verrouillés',
       case when exists (select 1 from pg_trigger where tgname = 'trg_lock_shop_privileged_columns' and not tgisinternal) then 'ok' else 'À VÉRIFIER' end
union all
select 'livraison : rémunération et étapes verrouillées',
       case when exists (select 1 from pg_trigger where tgname = 'trg_lock_delivery_stops_columns' and not tgisinternal)
             and position('driver_earning' in pg_get_functiondef('public.lock_delivery_missions_identity_columns()'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end
union all
select 'commandes : étapes vendeur contrôlées',
       case when exists (select 1 from pg_trigger where tgname = 'trg_guard_order_shop_status' and not tgisinternal) then 'ok' else 'À VÉRIFIER' end
union all
select 'codes de livraison privés',
       case when not exists (select 1 from public.orders where delivery_code is not null)
             and not exists (select 1 from public.delivery_missions where delivery_code is not null)
             and position('delivery_codes' in pg_get_functiondef('public.driver_complete_delivery(uuid, text, text)'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end
union all
select 'avis réservés aux acheteurs',
       case when exists (select 1 from pg_policy where polname = 'reviews_insert_own' and pg_get_expr(polwithcheck, polrelid) like '%order_items%') then 'ok' else 'À VÉRIFIER' end
union all
select 'stockage : types et tailles imposés',
       case when not exists (select 1 from storage.buckets where id in ('product-images', 'Shop-images', 'secure-photos') and (file_size_limit is null or allowed_mime_types is null)) then 'ok' else 'À VÉRIFIER' end
union all
select 'produits : format des catégories',
       case when exists (select 1 from pg_constraint where conname = 'products_subcategory_format_check' and convalidated) then 'ok' else 'À VÉRIFIER' end
union all
select 'limite d''appels : réservée au serveur',
       case when has_function_privilege('service_role', 'public.consume_api_quota(uuid, text, integer, integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.consume_api_quota(uuid, text, integer, integer)', 'execute')
             and not has_function_privilege('anon', 'public.consume_api_quota(uuid, text, integer, integer)', 'execute') then 'ok' else 'À VÉRIFIER' end;
