-- Retour arrière de docs/sql/securite-mfa-admin.sql : retire le contrôle par
-- le serveur. La double authentification reste demandée par l'interface, mais
-- n'est plus imposée par la base. Aucune donnée touchée. Rejouable.
begin;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator reset pgrst.db_pre_request';
  end if;
end $$;
drop policy if exists admins_can_read_own_row on public.admins;
create policy admins_can_read_own_row on public.admins for select to authenticated
  using (user_id = auth.uid());
drop function if exists public.ezial_pre_request();
drop function if exists public.ezial_admin_mfa_ok();
commit;
notify pgrst, 'reload config';
select 'contrôle serveur de la double authentification retiré' as verification,
       case when to_regprocedure('public.ezial_pre_request()') is null then 'ok' else 'ERREUR' end as resultat;
