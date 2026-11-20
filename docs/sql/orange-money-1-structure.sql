-- ============================================================================
-- Orange Money (QR Code – OM) — migration 1/4 : STRUCTURE
-- Ajoute des colonnes, un statut de tentative et une table d'anomalies.
-- Aucun changement de comportement : tout est inactif tant que
-- payment_settings.orange_money_enabled reste à false (valeur par défaut).
-- Wave, les commissions, les soldes vendeurs et les commandes existantes ne sont pas touchés.
-- Sûre à relancer (idempotente). Retour arrière : orange-money-retour-arriere.sql
-- ============================================================================
begin;

-- 1. Réglages : interrupteur Orange Money, fenêtre de paiement et délai de grâce
alter table public.payment_settings
  add column if not exists orange_money_enabled boolean not null default false,
  add column if not exists payment_window_minutes integer not null default 30
    check (payment_window_minutes between 5 and 120),
  add column if not exists payment_grace_minutes integer not null default 15
    check (payment_grace_minutes between 0 and 120);

-- 2. Commandes : paiement exigé avant toute notification, préparation ou livraison
alter table public.orders
  add column if not exists payment_required boolean not null default false,
  add column if not exists payment_deadline timestamptz,
  add column if not exists payment_grace_until timestamptz,
  add column if not exists paid_processed_at timestamptz,      -- notifications « payé » envoyées (une seule fois)
  add column if not exists stock_released_at timestamptz,      -- stock restitué (une seule fois)
  add column if not exists payment_cancel_reason text;

create index if not exists orders_unpaid_to_finalize_idx
  on public.orders (payment_grace_until)
  where payment_required and paid_processed_at is null and status <> 'cancelled';

-- 3. Tentatives de paiement : historique conservé, suivi de la vérification chez Orange
alter table public.payment_transactions
  add column if not exists checkout_data jsonb,                 -- QR, liens d'ouverture de l'appli, identifiant du QR
  add column if not exists provider_transaction_id text,        -- identifiant de la transaction chez Orange (connu après paiement)
  add column if not exists verified_status text,                -- dernier statut constaté chez Orange
  add column if not exists last_checked_at timestamptz,
  add column if not exists check_count integer not null default 0,
  add column if not exists provider_closed_at timestamptz,      -- Orange a confirmé que cette tentative est terminée
  add column if not exists superseded_at timestamptz;           -- ancien QR remplacé (reste surveillé)

alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions add constraint payment_transactions_status_check
  check (status in ('initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'expired', 'superseded', 'duplicate'));

create unique index if not exists payment_transactions_provider_txid_key
  on public.payment_transactions (provider, provider_transaction_id) where provider_transaction_id is not null;
create index if not exists payment_transactions_to_verify_idx
  on public.payment_transactions (last_checked_at nulls first)
  where provider_closed_at is null and status in ('initiated', 'pending', 'superseded');

-- 4. Anomalies de paiement (paiement tardif, doublon, montant différent, statut incertain)
create table if not exists public.payment_anomalies (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  kind text not null check (kind in ('late_payment_on_cancelled_order', 'double_payment', 'amount_mismatch', 'payment_uncertain')),
  status text not null default 'open' check (status in ('open', 'in_review', 'refund_pending', 'refunded', 'resolved')),
  details jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
-- Une même anomalie n'est enregistrée qu'une fois, même si Orange renvoie la notification.
create unique index if not exists payment_anomalies_once_per_transaction
  on public.payment_anomalies (transaction_id, kind) where transaction_id is not null;
create unique index if not exists payment_anomalies_once_per_order
  on public.payment_anomalies (order_id, kind) where transaction_id is null;
create index if not exists payment_anomalies_open_idx on public.payment_anomalies (status, created_at desc);

alter table public.payment_anomalies enable row level security;
drop policy if exists payment_anomalies_admin_select on public.payment_anomalies;
create policy payment_anomalies_admin_select on public.payment_anomalies for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
revoke all on public.payment_anomalies from anon, authenticated;
grant select on public.payment_anomalies to authenticated;   -- lecture limitée aux admins par la règle ci-dessus

commit;
