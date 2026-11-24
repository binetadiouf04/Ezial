-- Socle minimal reproduisant la production (24 nov. 2026) pour tester
-- docs/sql/lancement-boutiques.sql : rôles Supabase, auth.users, tables
-- concernées et services externes simulés (pg_net, coffre).
-- Base de test UNIQUEMENT : ne jamais exécuter en production.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

create schema auth;
create schema ezial_private;
create schema net;
create schema vault;

-- Comme en production : seul postgres a accès à ezial_private.
revoke all on schema ezial_private from public;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);
alter table auth.users owner to supabase_auth_admin;
grant usage on schema auth to supabase_auth_admin;

create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- pg_net simulé : chaque appel est enregistré.
create table net.calls (id bigserial primary key, url text, body jsonb, at timestamptz default clock_timestamp());
create function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb) returns bigint
language sql as $$ insert into net.calls (url, body) values (url, body) returning id $$;

-- Coffre simulé (valeur factice, aucun vrai secret).
create view vault.decrypted_secrets as select 'push_webhook_secret'::text as name, 'test'::text as decrypted_secret;

create type public.user_role as enum ('customer', 'seller', 'driver', 'admin');

create table public.profiles (
  id uuid primary key,
  role public.user_role not null default 'customer',
  email text,
  is_suspended boolean not null default false
);

create table public.admins (user_id uuid primary key, created_at timestamptz not null default now());

create table public.customer_profiles (
  id uuid primary key, first_name text, last_name text, phone text, email text
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  phone text,
  neighborhood text,
  address_text text,
  status text not null default 'active',
  seller_code text unique,
  pin_hash text,
  active_product_limit integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_official boolean not null default false,
  suspension_reason text,
  constraint shops_owner_id_unique unique (owner_id),
  constraint shops_status_check check (status = any (array['draft','pending','active','suspended','rejected','flagged','disabled','paused','deleted']))
);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text, message text,
  shop_id uuid references public.shops(id) on delete set null,
  is_read boolean default false,
  created_at timestamptz default now(),
  order_id uuid, claim_id uuid, mission_id uuid, url text
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text, title text, body text, url text,
  order_id uuid, claim_id uuid, mission_id uuid,
  shop_id uuid references public.shops(id) on delete set null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table ezial_private.security_events (id bigserial primary key, kind text, severity text, details jsonb);
create function ezial_private.log_security_event(p_kind text, p_severity text, p_details jsonb, p_user uuid default null) returns void
language sql security definer as $$ insert into ezial_private.security_events (kind, severity, details) values (p_kind, p_severity, p_details) $$;
create function ezial_private.mark_catalog_changed() returns trigger language plpgsql as $$ begin return null; end $$;

grant usage on schema public to anon, authenticated, supabase_auth_admin;
grant usage on schema auth to anon, authenticated;
grant select, insert, update on public.shops to authenticated;
grant select on public.admins to authenticated;
