-- Retour arrière « paiements et décaissements ». Retire déclencheurs,
-- fonctions et tâche planifiée. Les tables (transactions, versements,
-- moyens de réception, journal d'audit) et les colonnes ajoutées sont
-- CONSERVÉES : elles peuvent contenir un historique financier. Les ventes
-- créées entre-temps restent « en attente » (statut honnête : non payées).
begin;
drop trigger if exists trg_guard_delivery_confirmation on public.delivery_missions;
drop trigger if exists trg_seller_sale_starts_pending on public.seller_transactions;
drop trigger if exists trg_finance_order_shop_status on public.order_shops;
drop trigger if exists trg_finance_order_status on public.orders;
drop trigger if exists trg_finance_mission_status on public.delivery_missions;
drop trigger if exists trg_finance_claim on public.order_claims;
drop trigger if exists trg_events_order_created on public.orders;
select cron.unschedule('payments-maintenance') where exists (select 1 from cron.job where jobname = 'payments-maintenance');
select cron.unschedule('payouts-dispatch') where exists (select 1 from cron.job where jobname = 'payouts-dispatch');
drop function if exists ezial_private.guard_delivery_confirmation();
drop function if exists ezial_private.trg_seller_sale_starts_pending();
drop function if exists ezial_private.trg_finance_refresh();
drop function if exists ezial_private.trg_events_order_created();
drop function if exists public.driver_complete_delivery(uuid, text, text);
drop function if exists public.payments_create_transaction(uuid, text, uuid);
drop function if exists public.payments_set_pending(uuid, text, text, timestamptz);
drop function if exists public.payments_record_event(text, text, text, text, text, text, integer, boolean);
drop function if exists public.payments_mark_event_processed(uuid, text);
drop function if exists public.payments_confirm(uuid, text, integer);
drop function if exists public.payments_fail(uuid, text, text);
drop function if exists public.payouts_prepare_due();
drop function if exists public.payouts_claim_batch(integer);
drop function if exists public.payouts_to_reconcile(integer);
drop function if exists public.payouts_record_result(uuid, text, text, text);
drop function if exists public.payments_record_provider_status(text, text, boolean, boolean, integer, text);
drop function if exists public.payments_maintenance();
drop function if exists public.submit_payout_method(text, text, text, boolean);
drop function if exists public.admin_review_payout_method(uuid, boolean, text);
drop function if exists public.admin_confirm_pickup(uuid);
drop function if exists public.seller_finance_summary();
drop function if exists ezial_private.refresh_order_eligibility(uuid);
drop function if exists ezial_private.refresh_order_shop_eligibility(uuid);
drop function if exists ezial_private.order_shop_delivered(uuid);
drop function if exists ezial_private.normalize_wallet_phone(text);
drop function if exists ezial_private.emit_event(text, uuid, text, jsonb);
drop function if exists ezial_private.audit(text, text, text, uuid, jsonb);
commit;
