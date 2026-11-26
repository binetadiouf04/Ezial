-- Retour arrière de commandes-ouverture.sql : les commandes ne sont plus bloquées.
begin;
drop trigger if exists a_orders_block_before_launch on public.orders;
drop function if exists ezial_private.trg_orders_block_before_launch();
drop function if exists public.ordering_status();
alter table public.payment_settings drop column if exists ordering_opens_at;
commit;
