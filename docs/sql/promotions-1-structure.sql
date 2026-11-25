-- ============================================================================
-- Ezial — Campagnes promotionnelles, phase 1 — MIGRATION 1 / 3 : STRUCTURE
-- Contrat : docs/promotions/contrat-phase1.md
--
-- QUOI
--   * tables promotions, promotion_targets, promotion_seller_shares (part facultative financée par une boutique
--     qui l'a acceptée), promotion_redemptions, promotion_compensations (contraintes, index, règles d'accès RLS) ;
--   * colonnes orders.promotion_id / promo_discount / delivery_discount et order_shops.promo_compensation /
--     promo_seller_share (0 par défaut : les commandes existantes ne changent pas) ;
--   * pas de zone : la livraison couvre toute la région de Dakar, sans condition de quartier ;
--   * reprise de l'ancien code EZI10 (public.promo_codes) en campagne « suspendue » : 10 %, mêmes dates.
--     public.promo_codes n'est ni modifiée ni supprimée.
-- POURQUOI
--   Ezial finance les promotions : la commande garde la trace de la réduction, la boutique garde sa commission
--   habituelle ; la part de la réduction rattachée à chaque boutique sort de son solde automatique et lui est
--   reversée à la main (compensation), moins la part qu'elle a acceptée de financer (part vendeur, facultative).
-- RÈGLES D'ACCÈS
--   * campagnes, cibles, parts vendeurs : LECTURE pour les administrateurs uniquement ; écriture seulement par
--     les fonctions admin_promotion_save / admin_promotion_set_status (migration 3) ;
--   * utilisations et compensations : LECTURE seule pour les administrateurs (elles ne s'écrivent que
--     par les fonctions serveur : commande, annulation, paiement manuel) ; un vendeur lit les
--     compensations de SES boutiques ; aucun client ne lit ni n'écrit rien d'autre.
-- PRÉREQUIS : aucun (Orange Money 1 à 6 déjà en production). N'active AUCUNE promotion et ne change
--   rien aux commandes tant que la migration 2 n'est pas exécutée.
-- RELANÇABLE : oui (une seule transaction ; rien n'est dupliqué si on l'exécute deux fois).
-- RETOUR ARRIÈRE : docs/sql/promotions-1-retour-arriere.sql (après celui des migrations 3 et 2).
-- ============================================================================
begin;

-- 1. Campagnes
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  code text null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind text not null check (kind in ('fixed', 'percent', 'free_delivery')),
  value numeric not null default 0,
  max_discount integer null check (max_discount is null or max_discount > 0),
  min_amount integer not null default 0 check (min_amount >= 0),
  delivery_cap integer null check (delivery_cap is null or delivery_cap > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  audience text not null default 'all' check (audience in ('all', 'new_customers')),
  max_uses_total integer null check (max_uses_total is null or max_uses_total > 0),
  max_uses_per_customer integer null default 1 check (max_uses_per_customer is null or max_uses_per_customer > 0),
  budget_max integer null check (budget_max is null or budget_max > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  budget_used integer not null default 0 check (budget_used >= 0),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_dates_check check (ends_at > starts_at),
  constraint promotions_value_check check (
       (kind = 'percent' and value >= 1 and value <= 90)
    or (kind = 'fixed' and value > 0 and value = trunc(value))
    or (kind = 'free_delivery' and value >= 0))
);
create index if not exists promotions_automatic_active_idx on public.promotions (ends_at) where code is null and status = 'active';

-- Statut « terminée » définitif, date de modification tenue à jour.
create or replace function ezial_private.trg_promotions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'ended' and new.status <> 'ended' then
    raise exception 'Cette campagne est terminée : son statut est définitif.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.name, new.code, new.kind, new.value, new.max_discount, new.min_amount, new.delivery_cap, new.starts_at,
      new.ends_at, new.status, new.audience, new.max_uses_total, new.max_uses_per_customer, new.budget_max)
      is distinct from (old.name, old.code, old.kind, old.value, old.max_discount, old.min_amount, old.delivery_cap, old.starts_at,
      old.ends_at, old.status, old.audience, old.max_uses_total, old.max_uses_per_customer, old.budget_max) then
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function ezial_private.trg_promotions_guard() from public, anon, authenticated;
drop trigger if exists trg_promotions_guard on public.promotions;
create trigger trg_promotions_guard before update on public.promotions for each row execute function ezial_private.trg_promotions_guard();

-- 2. Cibles (aucune = tout le catalogue) et parts vendeurs (accord de la boutique obligatoire)
create table if not exists public.promotion_targets (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  target_type text not null check (target_type in ('product', 'shop', 'category', 'subcategory')),
  target_ref text not null check (btrim(target_ref) <> '' and (target_type <> 'subcategory' or target_ref like '%_/_%')),
  primary key (promotion_id, target_type, target_ref)
);
create table if not exists public.promotion_seller_shares (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  shop_id uuid not null references public.shops(id),
  share_type text not null check (share_type in ('fixed', 'percent')),
  share_value numeric not null check (
       (share_type = 'percent' and share_value >= 1 and share_value <= 100)
    or (share_type = 'fixed' and share_value > 0 and share_value = trunc(share_value))),
  agreed boolean not null check (agreed),
  agreed_note text null,
  created_at timestamptz not null default now(),
  primary key (promotion_id, shop_id)
);

-- 3. Utilisations (une par commande) et compensations (une par boutique concernée, part Ezial > 0)
create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id),
  order_id uuid not null unique references public.orders(id),
  customer_id uuid null,
  status text not null default 'counted' check (status in ('counted', 'cancelled')),
  eligible_amount integer not null default 0 check (eligible_amount >= 0),
  product_discount integer not null default 0 check (product_discount >= 0),
  delivery_discount integer not null default 0 check (delivery_discount >= 0),
  ezial_cost integer not null default 0 check (ezial_cost >= 0),
  seller_funded integer not null default 0 check (seller_funded >= 0),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  constraint promotion_redemptions_cost_check check (ezial_cost = product_discount + delivery_discount - seller_funded)
);
create index if not exists promotion_redemptions_promotion_idx on public.promotion_redemptions (promotion_id, status);
create index if not exists promotion_redemptions_customer_idx on public.promotion_redemptions (customer_id, promotion_id) where status = 'counted';

create table if not exists public.promotion_compensations (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.promotion_redemptions(id),
  order_id uuid not null references public.orders(id),
  order_shop_id uuid not null references public.order_shops(id),
  shop_id uuid not null references public.shops(id),
  amount integer not null check (amount > 0),
  seller_share integer not null default 0 check (seller_share >= 0),
  gross_allocation integer not null default 0 check (gross_allocation >= 0),
  status text not null default 'due' check (status in ('due', 'paid', 'cancelled')),
  paid_at timestamptz null,
  paid_method text null check (paid_method is null or paid_method in ('wave', 'orange_money', 'especes', 'virement', 'autre')),
  paid_reference text null,
  paid_by uuid null,
  note text null,
  created_at timestamptz not null default now(),
  constraint promotion_compensations_one_per_shop unique (redemption_id, order_shop_id),
  constraint promotion_compensations_split_check check (gross_allocation = amount + seller_share),
  constraint promotion_compensations_paid_check check (status <> 'paid' or (paid_at is not null and paid_method is not null))
);
create index if not exists promotion_compensations_shop_idx on public.promotion_compensations (shop_id, status);
create index if not exists promotion_compensations_status_idx on public.promotion_compensations (status, created_at);
create index if not exists promotion_compensations_order_shop_idx on public.promotion_compensations (order_shop_id);

-- 4. Commandes : trace de la campagne appliquée (0 / null pour toutes les commandes existantes)
alter table public.orders add column if not exists promotion_id uuid null references public.promotions(id);
alter table public.orders add column if not exists promo_discount integer not null default 0;
alter table public.orders add column if not exists delivery_discount integer not null default 0;
alter table public.order_shops add column if not exists promo_compensation integer not null default 0;   -- A_s : part de la réduction retirée du solde automatique
alter table public.order_shops add column if not exists promo_seller_share integer not null default 0;   -- V_s : partie financée par la boutique (incluse dans A_s)
alter table public.orders drop constraint if exists orders_promo_discounts_check;
alter table public.orders add constraint orders_promo_discounts_check check (promo_discount >= 0 and delivery_discount >= 0 and delivery_discount <= delivery_fee);
alter table public.order_shops drop constraint if exists order_shops_promo_compensation_check;
alter table public.order_shops add constraint order_shops_promo_compensation_check check (promo_compensation >= 0 and promo_seller_share >= 0 and promo_seller_share <= promo_compensation);
create index if not exists orders_promotion_idx on public.orders (promotion_id) where promotion_id is not null;

-- 5. Règles d'accès
alter table public.promotions enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.promotion_seller_shares enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.promotion_compensations enable row level security;

revoke all on public.promotions, public.promotion_targets, public.promotion_seller_shares,
  public.promotion_redemptions, public.promotion_compensations from anon, authenticated;
-- LECTURE seule, même pour les administrateurs : toute écriture passe par les fonctions serveur
-- (admin_promotion_save / admin_promotion_set_status : contrôles, double authentification, journal).
grant select on public.promotions, public.promotion_targets, public.promotion_seller_shares,
  public.promotion_redemptions, public.promotion_compensations to authenticated;
grant all on public.promotions, public.promotion_targets, public.promotion_seller_shares,
  public.promotion_redemptions, public.promotion_compensations to service_role;

drop policy if exists promotions_admin_all on public.promotions;
drop policy if exists promotions_admin_select on public.promotions;
create policy promotions_admin_select on public.promotions for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists promotion_targets_admin_all on public.promotion_targets;
drop policy if exists promotion_targets_admin_select on public.promotion_targets;
create policy promotion_targets_admin_select on public.promotion_targets for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists promotion_seller_shares_admin_all on public.promotion_seller_shares;
drop policy if exists promotion_seller_shares_admin_select on public.promotion_seller_shares;
create policy promotion_seller_shares_admin_select on public.promotion_seller_shares for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists promotion_redemptions_admin_select on public.promotion_redemptions;
create policy promotion_redemptions_admin_select on public.promotion_redemptions for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists promotion_compensations_admin_select on public.promotion_compensations;
create policy promotion_compensations_admin_select on public.promotion_compensations for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists promotion_compensations_seller_select on public.promotion_compensations;
create policy promotion_compensations_seller_select on public.promotion_compensations for select to authenticated
  using (shop_id in (select s.id from public.shops s where s.owner_id = (select auth.uid())));

-- 6. Reprise de l'ancien code EZI10 : campagne SUSPENDUE (rien n'est appliqué tant que l'administratrice ne la réactive pas)
insert into public.promotions (name, code, kind, value, min_amount, starts_at, ends_at, status, audience, max_uses_per_customer)
select 'EZI10 (ancien code promo)', upper(pc.code), 'percent', 10, coalesce(pc.min_order_amount, 0),
       coalesce(pc.start_date, pc.created_at), coalesce(pc.end_date, '2026-12-31 00:00:00+00'::timestamptz), 'paused', 'all', 1
  from public.promo_codes pc
 where upper(pc.code) = 'EZI10' and pc.discount_type = 'percent'
on conflict (code) do nothing;

commit;

-- Vérification : toutes les lignes « ok » attendues.
select 'tables créées' as element, case when to_regclass('public.promotions') is not null and to_regclass('public.promotion_compensations') is not null then 'ok' else 'À VÉRIFIER' end as etat
union all select 'EZI10 repris, suspendu', case when exists (select 1 from public.promotions where code = 'EZI10' and status = 'paused') then 'ok' else 'À VÉRIFIER (EZI10 absent de promo_codes ?)' end
union all select 'colonnes de commande', case when (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'orders' and column_name in ('promotion_id', 'promo_discount', 'delivery_discount')) or (table_name = 'order_shops' and column_name in ('promo_compensation', 'promo_seller_share')))) = 5 then 'ok' else 'À VÉRIFIER' end;
