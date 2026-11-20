#!/usr/bin/env bash
# Génère docs/sql/orange-money-retour-arriere.sql : suppression de ce que les migrations ajoutent,
# puis restauration des fonctions de PRODUCTION (11-baseline-remplacees.sql) et des règles d'accès d'origine.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../docs/sql/orange-money-retour-arriere.sql
cat > "$OUT" <<'HEAD'
-- ============================================================================
-- Orange Money (QR Code – OM) — RETOUR ARRIÈRE des migrations 1 à 4
-- Rétablit exactement le comportement de production d'avant Orange Money.
-- AVANT de l'exécuter :
--   1. éteindre l'interrupteur :  update public.payment_settings set orange_money_enabled = false;
--   2. vérifier qu'aucune commande Orange Money n'attend un paiement :
--        select count(*) from public.orders where payment_required and paid_processed_at is null and status <> 'cancelled';
--      (doit renvoyer 0 ; sinon attendre leur paiement ou leur annulation)
-- Les colonnes et la table payment_anomalies sont CONSERVÉES (aucune donnée perdue) : voir la fin du script
-- pour les supprimer, ce qui est irréversible.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public.orders where payment_required and paid_processed_at is null and status <> 'cancelled') then
    raise exception 'Des commandes Orange Money attendent encore un paiement : retour arrière refusé.';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'orders-finalize-unpaid';
  end if;
end $$;

-- 1. Déclencheurs ajoutés
drop trigger if exists trg_a_set_payment_required on public.orders;
drop trigger if exists trg_orders_on_paid on public.orders;
drop trigger if exists trg_a_block_unpaid_progress on public.orders;
drop trigger if exists trg_a_block_unpaid_progress on public.order_shops;
drop trigger if exists trg_a_block_unpaid_mission on public.delivery_missions;
drop trigger if exists trg_a_skip_unpaid_sale on public.seller_transactions;

-- 2. Règles d'accès des vendeurs d'origine
alter policy sellers_select_orders_with_own_shop on public.orders
  using (id in (select os.order_id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid()));
alter policy sellers_select_own_order_shops on public.order_shops
  using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()));
alter policy sellers_update_own_order_shops_status on public.order_shops
  using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()))
  with check (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()));
alter policy sellers_select_own_order_items on public.order_items
  using (order_shop_id in (select os.id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid()));

-- 3. Tentatives : statuts ajoutés ramenés aux statuts d'origine, puis contrainte d'origine
update public.payment_transactions set status = 'cancelled' where status in ('superseded', 'duplicate');
alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions add constraint payment_transactions_status_check
  check (status in ('initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'expired'));

-- 4. Fonctions de production restaurées
HEAD
sed -e '/^-- Versions de PRODUCTION/,/^$/d' 11-baseline-remplacees.sql >> "$OUT"
cat >> "$OUT" <<'TAIL'

-- 5. Fonctions et filet de sécurité ajoutés
drop function if exists public.admin_payment_attempts(text[], integer);
drop function if exists public.admin_payment_anomalies(text);
drop function if exists public.admin_update_payment_anomaly(uuid, text, text);
drop function if exists public.payments_reconcile_candidates(integer);
drop function if exists public.payments_record_verification(uuid, text, integer, text);
drop function if exists ezial_private.orders_finalize_unpaid();
drop function if exists ezial_private.restock_order(uuid);
drop function if exists ezial_private.trg_orders_set_payment_required();
drop function if exists ezial_private.trg_skip_unpaid_sale();
drop function if exists ezial_private.trg_orders_on_paid();
drop function if exists ezial_private.trg_block_unpaid_progress();
drop function if exists ezial_private.trg_block_unpaid_mission();
drop function if exists public.order_is_unpaid(uuid);
alter table public.product_variants drop constraint if exists product_variants_stock_non_negative;
drop index if exists public.orders_unpaid_to_finalize_idx;
drop index if exists public.payment_transactions_to_verify_idx;

commit;

-- ============================================================================
-- OPTIONNEL ET IRRÉVERSIBLE : supprimer aussi les colonnes et la table ajoutées (perte de leurs données).
-- À n'exécuter que si les anomalies et l'historique de vérification ne servent plus.
-- ============================================================================
-- begin;
-- drop table if exists public.payment_anomalies;
-- alter table public.orders drop column if exists payment_required, drop column if exists payment_deadline, drop column if exists payment_grace_until,
--   drop column if exists paid_processed_at, drop column if exists stock_released_at, drop column if exists payment_cancel_reason;
-- alter table public.payment_transactions drop column if exists checkout_data, drop column if exists provider_transaction_id, drop column if exists verified_status,
--   drop column if exists last_checked_at, drop column if exists check_count, drop column if exists provider_closed_at, drop column if exists superseded_at;
-- alter table public.payment_settings drop column if exists orange_money_enabled, drop column if exists payment_window_minutes, drop column if exists payment_grace_minutes;
-- commit;
TAIL
echo "écrit : $OUT"
