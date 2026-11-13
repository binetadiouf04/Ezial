\pset format unaligned
\pset tuples_only on
-- simulation d'une requête API : le contrôle préalable s'exécute d'abord, comme le fait PostgREST
create or replace function pg_temp.req(p_label text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  begin perform public.ezial_pre_request(); exception when others then return p_label || ' => REFUSÉ avant la requête (' || sqlerrm || ', ' || sqlstate || ')'; end;
  begin execute p_sql into v; exception when others then return p_label || ' => erreur : ' || sqlerrm; end;
  return p_label || ' => ' || coalesce(v, 'null');
end $$;
grant execute on function pg_temp.req(text, text) to public;
insert into auth.users(id, email) values ('a0000000-0000-4000-8000-000000000000', 'admin@test.local'), ('a9000000-0000-4000-8000-000000000000', 'admin2@test.local'), ('b1000000-0000-4000-8000-000000000000', 'client@test.local'), ('c1000000-0000-4000-8000-000000000000', 'vendeur@test.local') on conflict do nothing;
insert into public.admins(user_id) values ('a0000000-0000-4000-8000-000000000000'), ('a9000000-0000-4000-8000-000000000000') on conflict do nothing;
insert into public.profiles(id, role) values ('c1000000-0000-4000-8000-000000000000', 'seller') on conflict do nothing;
insert into public.shops(id, owner_id, name, slug, status) values ('51000000-0000-4000-8000-000000000000', 'c1000000-0000-4000-8000-000000000000', 'Boutique', 'boutique', 'active') on conflict do nothing;
insert into public.promo_codes(code, discount_type, discount_value, is_active) values ('TEST10', 'percent', 10, true) on conflict do nothing;
set role authenticated;
\echo --- 1. administrateur SANS facteur (situation actuelle) : rien ne change
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000000","role":"authenticated","aal":"aal1"}';
select pg_temp.req('admin sans facteur : est administrateur', 'select count(*) from public.admins');
select pg_temp.req('admin sans facteur : lit les codes promo', 'select count(*) from public.promo_codes');
select pg_temp.req('admin sans facteur : offre Ezial Plus', $q$select (public.admin_grant_premium('51000000-0000-4000-8000-000000000000', 3, 'test')) ? 'grantId'$q$);
reset role;
insert into auth.mfa_factors(user_id, friendly_name, status) values ('a0000000-0000-4000-8000-000000000000', 'abandonné', 'unverified');
set role authenticated;
select pg_temp.req('admin avec facteur NON vérifié (inscription abandonnée) : toujours administrateur', 'select count(*) from public.admins');
reset role;
update auth.mfa_factors set status = 'verified' where user_id = 'a0000000-0000-4000-8000-000000000000';
set role authenticated;
\echo --- 2. administrateur AVEC facteur vérifié, session sans code (mot de passe volé)
select pg_temp.req('sans code : lecture des commandes', 'select count(*) from public.orders');
select pg_temp.req('sans code : fonction admin appelée directement', $q$select public.admin_grant_premium('51000000-0000-4000-8000-000000000000', 6, 'x')::text$q$);
select pg_temp.req('sans code : confirmation de paiement', $q$select public.confirm_subscription_payment(gen_random_uuid())::text$q$);
\echo --- 3. même session, en contournant le contrôle préalable (appel direct des règles)
select 'contournement : se voit comme administrateur ? ' || (select count(*) from public.admins);
select 'contournement : codes promo visibles ? ' || (select count(*) from public.promo_codes);
do $$ begin update public.shops set status = 'suspended' where id = '51000000-0000-4000-8000-000000000000'; raise notice 'contournement : boutiques modifiées = % (statut %)', (select count(*) from public.shops where status = 'suspended'), (select status from public.shops limit 1); end $$;
do $$ begin insert into public.promo_codes(code, discount_type, discount_value, is_active) values ('PIRATE', 'percent', 100, true); raise notice 'contournement : code promo créé (ANORMAL)'; exception when others then raise notice 'contournement : création de code promo refusée (%)', sqlstate; end $$;
\echo --- 4. administrateur AVEC facteur, session validée par le code (aal2)
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000000","role":"authenticated","aal":"aal2"}';
select pg_temp.req('avec code : est administrateur', 'select count(*) from public.admins');
select pg_temp.req('avec code : lit les codes promo', 'select count(*) from public.promo_codes');
select pg_temp.req('avec code : prolonge l''accès offert', $q$select (public.admin_extend_premium_grant((select id from public.premium_grants limit 1), 3, 'ok')) ? 'endsAt'$q$);
\echo --- 5. autres comptes : inchangés
set request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000000","role":"authenticated","aal":"aal1"}';
select pg_temp.req('second administrateur sans facteur : inchangé', 'select count(*) from public.admins');
set request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000000","role":"authenticated","aal":"aal1"}';
select pg_temp.req('client : catalogue', 'select count(*) from public.shops');
select pg_temp.req('client : n''est pas administrateur', 'select count(*) from public.admins');
set request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000000","role":"authenticated","aal":"aal1"}';
select pg_temp.req('vendeur : sa boutique', 'select count(*) from public.shops where owner_id = auth.uid()');
reset role; set role anon; set request.jwt.claims = '{"role":"anon"}';
select pg_temp.req('visiteur anonyme : catalogue', 'select count(*) from public.shops');
reset role; set role service_role; set request.jwt.claims = '{"role":"service_role"}';
select pg_temp.req('clé serveur (fonctions Edge) : inchangée', 'select count(*) from public.admins');
reset role;
