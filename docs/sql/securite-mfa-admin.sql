-- Ezial — double authentification administrateur : contrôle par le serveur.
-- À exécuter SEULEMENT après avoir activé la double authentification dans
-- l'espace administrateur et vérifié la connexion avec le code.
-- Règle : dès qu'un administrateur a un facteur vérifié, sa session doit avoir
-- été validée par le code (niveau aal2 du jeton) pour :
--   1. être reconnue comme administrateur par les règles d'accès (lecture de
--      la table admins, donc toutes les politiques RLS, stockage compris) ;
--   2. envoyer la moindre requête à l'API de la base (contrôle exécuté avant
--      chaque requête : couvre toutes les fonctions d'administration).
-- Sans facteur vérifié, rien ne change. Clients, vendeurs et livreurs ne sont
-- pas concernés. Rejouable. Retour arrière : securite-mfa-admin-retour-arriere.sql
begin;

-- Vrai si l'utilisateur courant n'a aucun facteur vérifié, ou si sa session a
-- été validée par le second facteur.
create or replace function public.ezial_admin_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke all on function public.ezial_admin_mfa_ok() from public;
grant execute on function public.ezial_admin_mfa_ok() to anon, authenticated, service_role;

-- 1. Un administrateur non validé par son code n'est plus « administrateur »
--    pour les règles d'accès.
drop policy if exists admins_can_read_own_row on public.admins;
create policy admins_can_read_own_row on public.admins for select to authenticated
  using (user_id = (select auth.uid()) and public.ezial_admin_mfa_ok());

-- 2. Contrôle avant chaque requête à l'API de la base.
create or replace function public.ezial_pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return; end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2' then return; end if;
  if exists (select 1 from public.admins a where a.user_id = v_uid)
     and exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified') then
    raise sqlstate 'PT403' using
      message = 'mfa_required',
      detail = 'La double authentification doit être validée pour ce compte administrateur.';
  end if;
end;
$$;
revoke all on function public.ezial_pre_request() from public;
grant execute on function public.ezial_pre_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.ezial_pre_request''';
  end if;
end $$;

commit;

notify pgrst, 'reload config';

-- Vérification : 3 lignes « ok » attendues.
select 'règle d''accès administrateur liée au second facteur' as element,
       case when exists (select 1 from pg_policy where polname = 'admins_can_read_own_row' and pg_get_expr(polqual, polrelid) like '%ezial_admin_mfa_ok%') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'contrôle avant chaque requête : fonction présente',
       case when to_regprocedure('public.ezial_pre_request()') is not null then 'ok' else 'À VÉRIFIER' end
union all
select 'contrôle avant chaque requête : activé',
       case when exists (select 1 from pg_roles where rolname = 'authenticator' and array_to_string(rolconfig, ',') like '%pgrst.db_pre_request=public.ezial_pre_request%') then 'ok' else 'À VÉRIFIER' end;
