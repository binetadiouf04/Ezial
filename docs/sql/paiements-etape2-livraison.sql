-- Étape 2 (à exécuter APRÈS la mise en ligne du site qui utilise
-- driver_complete_delivery) : plus aucune mission ne peut passer « livrée »
-- sans la vérification du code client par le serveur. Les administrateurs
-- gardent la main (incidents). Rejouable.
begin;
create or replace function ezial_private.guard_delivery_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and coalesce(current_setting('ezial.delivery_confirmed_by_server', true), '') <> 'on'
     and not exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
     and (select auth.uid()) is not null then
    raise exception 'La livraison doit être confirmée avec le code du client.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_delivery_confirmation on public.delivery_missions;
create trigger trg_guard_delivery_confirmation before update on public.delivery_missions
  for each row when (new.status = 'delivered' and old.status is distinct from new.status)
  execute function ezial_private.guard_delivery_confirmation();
commit;
select case when exists (select 1 from pg_trigger where tgname = 'trg_guard_delivery_confirmation') then 'ok' else 'À VÉRIFIER' end as livraison_verrouillee;
