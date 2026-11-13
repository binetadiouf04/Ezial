-- Ezial — correctif : un client inscrit ne pouvait pas commander.
-- Cause (constatée dans les journaux de production le 12/11/2026) : la table
-- orders exige une ligne dans profiles pour le client (clé étrangère
-- orders_customer_id_fkey), mais l'inscription d'un client ne remplissait que
-- customer_profiles. Toute commande échouait donc avec une erreur de clé
-- étrangère ; le consentement aux notifications ne s'enregistrait pas non plus.
-- Correction : chaque profil client crée automatiquement sa ligne profiles
-- (rôle « customer »), et les comptes clients existants sont rattrapés.
-- Aucune donnée supprimée ni modifiée. Rejouable, une transaction.
begin;

create or replace function ezial_private.ensure_profile_for_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, email, first_name, last_name, phone)
  values (new.id, 'customer', new.email, new.first_name, new.last_name, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function ezial_private.ensure_profile_for_customer() from public, anon, authenticated;

drop trigger if exists trg_ensure_profile_for_customer on public.customer_profiles;
create trigger trg_ensure_profile_for_customer after insert on public.customer_profiles
  for each row execute function ezial_private.ensure_profile_for_customer();

-- Rattrapage des comptes clients existants (un compte vendeur ou livreur a
-- déjà sa ligne : elle n'est pas touchée).
insert into public.profiles (id, role, email, first_name, last_name, phone)
select c.id, 'customer', c.email, c.first_name, c.last_name, c.phone
  from public.customer_profiles c
 where exists (select 1 from auth.users u where u.id = c.id)
on conflict (id) do nothing;

commit;

-- Vérification : 2 lignes « ok » attendues.
select 'tous les clients ont leur ligne profiles' as element,
       case when not exists (
         select 1 from public.customer_profiles c
          where exists (select 1 from auth.users u where u.id = c.id)
            and not exists (select 1 from public.profiles p where p.id = c.id)) then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'les futurs clients l''auront automatiquement',
       case when exists (select 1 from pg_trigger where tgname = 'trg_ensure_profile_for_customer' and not tgisinternal) then 'ok' else 'À VÉRIFIER' end;
