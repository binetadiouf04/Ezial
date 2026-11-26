-- Commandes fermées jusqu'au lancement (12 décembre 2026, 00:00 à Dakar = UTC).
-- Déjà exécutée en production le 26 nov. 2026. Les comptes listés dans payment_testers peuvent toujours commander (tests finaux).
-- Pour ouvrir avant la date : update public.payment_settings set ordering_opens_at = now();
-- Pour retirer le blocage : voir commandes-ouverture-retour.sql.
begin;
alter table public.payment_settings add column if not exists ordering_opens_at timestamptz not null default '2026-12-12 00:00:00+00';

create or replace function ezial_private.trg_orders_block_before_launch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.payment_settings;
begin
  select * into s from public.payment_settings where id;
  if s.ordering_opens_at is not null and now() < s.ordering_opens_at and not ezial_private.is_payment_tester(new.customer_id) then
    raise exception 'Les commandes ouvrent le 12 décembre 2026. Revenez à partir de cette date pour passer commande : votre panier est conservé.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke all on function ezial_private.trg_orders_block_before_launch() from public, anon, authenticated;
drop trigger if exists a_orders_block_before_launch on public.orders;
create trigger a_orders_block_before_launch before insert on public.orders for each row execute function ezial_private.trg_orders_block_before_launch();

create or replace function public.ordering_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'open', s.ordering_opens_at is null or now() >= s.ordering_opens_at or ezial_private.is_payment_tester((select auth.uid())),
    'opens_at', s.ordering_opens_at)
  from public.payment_settings s where s.id;
$$;
revoke all on function public.ordering_status() from public;
grant execute on function public.ordering_status() to anon, authenticated;
commit;
