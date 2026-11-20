-- Banc de test LOCAL (PostgreSQL 16, aucune connexion à la production).
-- Reproduit le strict nécessaire du schéma Ezial pour tester la commande, le
-- stock, les paiements et les notifications. Les tables sont simplifiées (seules
-- les colonnes utilisées sont gardées) ; les fonctions et déclencheurs métier
-- viennent de 10-baseline.sql, copiés de la production le 20 novembre 2026.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create schema ezial_private;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create extension if not exists pgcrypto;

create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table auth.users (id uuid primary key);

grant usage on schema public, auth to anon, authenticated, service_role;
grant usage on schema ezial_private to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create type public.user_role as enum ('customer', 'seller', 'driver', 'admin');
create table public.profiles (id uuid primary key, role public.user_role default 'customer', is_suspended boolean default false);
create table public.admins (user_id uuid primary key);

create table public.shops (
  id uuid primary key default gen_random_uuid(), owner_id uuid, name text, status text default 'active',
  pickup_enabled boolean default false, is_official boolean default false, latitude numeric, longitude numeric);
create table public.products (
  id uuid primary key default gen_random_uuid(), shop_id uuid references public.shops(id), name text, reference text,
  status text default 'active', base_price integer, is_promo boolean default false, promo_price integer,
  promo_start timestamptz, promo_end timestamptz, sale_mode text, category text, subcategory text);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid references public.products(id), price integer,
  stock numeric not null default 0, attributes jsonb default '{}', updated_at timestamptz);
create table public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid, storage_path text, media_type text default 'image',
  variant_id uuid, is_primary boolean default false, sort_order integer default 0);
create table public.seller_subscriptions (shop_id uuid primary key, plan text, pro_until timestamptz);

create sequence public.order_number_seq;
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number text unique, customer_id uuid,
  status text not null default 'confirmed' check (status in ('confirmed','preparing','ready','out_for_delivery','delivered','ready_for_pickup','picked_up','cancelled')),
  fulfillment_type text check (fulfillment_type in ('delivery','pickup')),
  payment_method text check (payment_method in ('wave','orange_money','paypal')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  products_subtotal integer default 0, delivery_fee integer default 0, discount_amount integer default 0, total_amount integer default 0,
  neighborhood text, delivery_address text, delivery_notes text, preferred_delivery_date date, preferred_delivery_slot text, promo_code text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  first_name text, last_name text, phone text, email text, delivery_latitude numeric, delivery_longitude numeric,
  is_gift boolean default false, gift_recipient_name text, gift_recipient_phone text, gift_show_buyer_name boolean default false,
  gift_message text, gift_wrap boolean default false, gift_wrap_fee integer default 0, cgv_version text, cgv_accepted_at timestamptz, delivery_code text);
create table public.order_shops (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), shop_id uuid not null,
  fulfillment_type text, status text, route_sequence integer, subtotal numeric, pickup_code text, scheduled_date date, scheduled_window text,
  created_at timestamptz default now(), updated_at timestamptz default now(), commission_amount numeric, net_amount numeric, customer_id uuid,
  unique (order_id, shop_id));
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), product_id uuid, variant_id uuid, shop_id uuid,
  product_name text, product_reference text, image_url text, selected_options jsonb, quantity numeric check (quantity > 0),
  unit_price integer, line_total integer, created_at timestamptz default now(), order_shop_id uuid, original_unit_price numeric,
  discount_amount numeric, commission_rate numeric, commission_amount numeric, waist_cm numeric);
create table public.seller_transactions (
  id uuid primary key default gen_random_uuid(), shop_id uuid, order_id uuid, order_shop_id uuid, type text, gross_amount integer,
  commission_amount integer, net_amount integer, status text, payout_id uuid, available_at timestamptz, hold_reason text);
create table public.order_claims (id uuid primary key default gen_random_uuid(), order_shop_id uuid, status text);
create table public.delivery_missions (id uuid primary key default gen_random_uuid(), order_id uuid, status text, driver_id uuid, driver_earning integer);
create table public.delivery_stops (id uuid primary key default gen_random_uuid(), mission_id uuid, shop_id uuid, stop_order integer, status text);
create table ezial_private.delivery_codes (order_id uuid primary key, code text);

create table public.payment_settings (
  id boolean primary key default true check (id), collections_enabled boolean not null default false,
  payouts_enabled boolean not null default false, payout_frequency text default 'daily', payout_weekday integer default 1,
  fees_paid_by text default 'ezial', pickup_auto_eligible boolean default false, updated_at timestamptz default now());
insert into public.payment_settings (id) values (true);
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), provider text not null check (provider in ('wave','orange_money')),
  status text not null default 'initiated' check (status in ('initiated','pending','confirmed','failed','cancelled','expired')),
  amount integer not null check (amount > 0), currency text not null default 'XOF' check (currency = 'XOF'),
  idempotency_key text not null unique, provider_reference text, checkout_url text, failure_reason text, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), confirmed_at timestamptz);
create unique index payment_transactions_one_confirmed_per_order on public.payment_transactions (order_id) where status = 'confirmed';
create unique index payment_transactions_one_open_per_order on public.payment_transactions (order_id) where status in ('initiated','pending');
create unique index payment_transactions_provider_ref_key on public.payment_transactions (provider, provider_reference) where provider_reference is not null;
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), provider text not null check (provider in ('wave','orange_money')),
  capability text not null check (capability in ('collection','disbursement')), provider_event_id text not null, event_type text,
  provider_reference text, reported_status text, reported_amount integer, signature_valid boolean not null default false,
  received_at timestamptz default now(), processed_at timestamptz, result text, unique (provider, capability, provider_event_id));

create table public.finance_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, actor_kind text, action text, entity text, entity_id uuid,
  details jsonb, created_at timestamptz default now());
create table public.security_events (id uuid primary key default gen_random_uuid(), kind text, severity text, actor_id uuid, details jsonb, occurred_at timestamptz default now());
create table public.ezial_events (id uuid primary key default gen_random_uuid(), event_type text, entity_id uuid, dedupe_key text unique, payload jsonb, created_at timestamptz default now());
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, body text, url text, order_id uuid, claim_id uuid,
  mission_id uuid, shop_id uuid, is_read boolean default false, created_at timestamptz default now());
create table public.admin_notifications (id uuid primary key default gen_random_uuid(), type text, title text, url text, order_id uuid, created_at timestamptz default now());
create table public.whatsapp_settings (id boolean primary key default true, confirmation_requires_paid boolean default false);
insert into public.whatsapp_settings (id) values (true);
create table public.whatsapp_queue (id uuid primary key default gen_random_uuid(), kind text, dedupe_key text unique, order_id uuid);

-- Fonctions annexes simplifiées (hors périmètre des tests)
create function public.haversine_km(a numeric, b numeric, c numeric, d numeric) returns numeric language sql immutable as $$ select 3::numeric $$;
create function public.calculate_delivery_fee(km numeric) returns numeric language sql immutable as $$ select 1500::numeric $$;
create function public.validate_promo_code(c text, s integer) returns jsonb language sql as $$ select jsonb_build_object('valid', false, 'message', 'Code promo invalide.') $$;
create function public.push_notify(u uuid, t text, b text, l text) returns void language sql as $$ select $$;
create function public.notify_admins(p_type text, p_title text, p_url text, p_order uuid) returns void language sql security definer as
$$ insert into public.admin_notifications (type, title, url, order_id) values (p_type, p_title, p_url, p_order) $$;
create function ezial_private.ensure_delivery_code(p_order uuid) returns void language sql as $$ select $$;
create function ezial_private.whatsapp_enqueue(p_kind text, p_dedupe text, p_order uuid, p_a uuid, p_b uuid, p_user uuid, p_phone text, p_delay interval)
  returns void language sql security definer as
$$ insert into public.whatsapp_queue (kind, dedupe_key, order_id) values (p_kind, p_dedupe, p_order) on conflict (dedupe_key) do nothing $$;

-- Aides de test
create function tests.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ÉCHEC : %', p_name; end if;
  raise notice 'OK    : %', p_name;
end $$;
create function tests.as_user(p_uid uuid, p_role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
end $$;
create function tests.as_system() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;
