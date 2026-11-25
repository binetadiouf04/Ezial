-- Scénarios de docs/sql/lancement-boutiques.sql. Chaque vérification
-- échoue (ERREUR) si le résultat n'est pas celui attendu.
\set ON_ERROR_STOP on

create or replace function pg_temp.verifier(p_ok boolean, p_libelle text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'ÉCHEC : %', p_libelle; end if;
  raise notice 'OK : %', p_libelle;
end $$;

-- Un administrateur (pour les push) — un dans admins, un dans profiles.role.
insert into public.profiles (id, role, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'admin1@test');
insert into public.admins (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.profiles (id, role, email) values ('aaaaaaaa-0000-0000-0000-000000000002', 'admin', 'admin2@test');

-- ---------------------------------------------------------------------------
-- 1. Inscription vendeur, e-mail NON confirmé → boutique en brouillon
-- ---------------------------------------------------------------------------
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-0000-0000-0000-000000000001', 'v1@test', '{"role":"seller","shop_name":"Maison Awa","username":"maisonawa"}');
reset role;

select pg_temp.verifier((select status from public.shops where owner_id = '11111111-0000-0000-0000-000000000001') = 'draft',
  '1. inscription non confirmée : boutique en brouillon');
select pg_temp.verifier((select count(*) from public.admin_notifications) = 0, '1. aucune notification admin avant confirmation');

-- Le vendeur ne peut pas s'activer lui-même par une mise à jour directe.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
update public.shops set status = 'active' where owner_id = '11111111-0000-0000-0000-000000000001';
select pg_temp.verifier((public.activate_shop_if_ready() ->> 'ready') = 'false', '1. activate_shop_if_ready refuse tant que l''e-mail n''est pas confirmé');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verifier((select status from public.shops where owner_id = '11111111-0000-0000-0000-000000000001') = 'draft',
  '1. mise à jour directe du statut par le vendeur ignorée (drapeau jamais posé = NULL)');
-- Idem vers 'deleted' sur une connexion neuve (même trou avant la correction).
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
update public.shops set status = 'deleted' where owner_id = '11111111-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verifier((select status from public.shops where owner_id = '11111111-0000-0000-0000-000000000001') = 'draft',
  '1. passage direct à « deleted » par le vendeur ignoré');

-- ---------------------------------------------------------------------------
-- 2. Confirmation de l'e-mail → active + 1 notification admin + push
-- ---------------------------------------------------------------------------
truncate net.calls;
set role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id = '11111111-0000-0000-0000-000000000001';
reset role;

select pg_temp.verifier((select status from public.shops where owner_id = '11111111-0000-0000-0000-000000000001') = 'active',
  '2. confirmation : boutique active');
select pg_temp.verifier((select count(*) from public.admin_notifications where type = 'shop_registered') = 1, '2. une notification admin');
select pg_temp.verifier((select message from public.admin_notifications where type = 'shop_registered')
  = 'La boutique « Maison Awa » vient de rejoindre Ezial.', '2. texte de la notification');
select pg_temp.verifier((select url from public.admin_notifications where type = 'shop_registered')
  = '/pro/admin/boutiques/' || (select id from public.shops where owner_id = '11111111-0000-0000-0000-000000000001'), '2. lien vers la fiche boutique admin');
select pg_temp.verifier((select count(*) from net.calls where body ->> 'title' = 'Nouvelle boutique inscrite') = 2, '2. un push par administrateur (2)');
select pg_temp.verifier((select count(*) from public.notifications where type = 'shop_activated'
  and user_id = '11111111-0000-0000-0000-000000000001') = 1, '2. notification « Votre boutique est en ligne » au vendeur');

-- ---------------------------------------------------------------------------
-- 3. Re-confirmation / redéclenchement → aucun doublon
-- ---------------------------------------------------------------------------
truncate net.calls;
set role supabase_auth_admin;
update auth.users set email_confirmed_at = null where id = '11111111-0000-0000-0000-000000000001';
update auth.users set email_confirmed_at = now() where id = '11111111-0000-0000-0000-000000000001';
reset role;
select pg_temp.verifier((select count(*) from public.admin_notifications where type = 'shop_registered') = 1, '3. reconfirmation : toujours une seule notification');
select pg_temp.verifier((select count(*) from net.calls) = 0, '3. reconfirmation : aucun push');

-- Même si la boutique repassait en brouillon puis était réactivée : pas de 2e notification.
alter table public.shops disable trigger trg_prevent_seller_status_change;
update public.shops set status = 'draft' where owner_id = '11111111-0000-0000-0000-000000000001';
alter table public.shops enable trigger trg_prevent_seller_status_change;
select ezial_private.activate_shop_on_email_confirmed(id) from public.shops where owner_id = '11111111-0000-0000-0000-000000000001';
select pg_temp.verifier((select status from public.shops where owner_id = '11111111-0000-0000-0000-000000000001') = 'active', '3. réactivation du brouillon');
select pg_temp.verifier((select count(*) from public.admin_notifications where type = 'shop_registered') = 1, '3. garde-fou en base : pas de 2e notification');
select pg_temp.verifier((select count(*) from net.calls) = 0, '3. garde-fou : pas de 2e push');

-- ---------------------------------------------------------------------------
-- 4. Boutiques suspendue / refusée / en pause / supprimée → jamais réactivées
-- ---------------------------------------------------------------------------
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('22222222-0000-0000-0000-000000000001', 's1@test', '{"role":"seller","shop_name":"Suspendue","username":"suspendue"}'),
  ('22222222-0000-0000-0000-000000000002', 's2@test', '{"role":"seller","shop_name":"Refusee","username":"refusee"}'),
  ('22222222-0000-0000-0000-000000000003', 's3@test', '{"role":"seller","shop_name":"Pause","username":"pause"}'),
  ('22222222-0000-0000-0000-000000000004', 's4@test', '{"role":"seller","shop_name":"Supprimee","username":"supprimee"}');
reset role;
-- Statuts posés par un administrateur.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
update public.shops set status = 'suspended', suspension_reason = 'test' where owner_id = '22222222-0000-0000-0000-000000000001';
update public.shops set status = 'rejected' where owner_id = '22222222-0000-0000-0000-000000000002';
update public.shops set status = 'paused' where owner_id = '22222222-0000-0000-0000-000000000003';
update public.shops set status = 'deleted' where owner_id = '22222222-0000-0000-0000-000000000004';
select set_config('request.jwt.claim.sub', '', false);
set role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id::text like '22222222-%';
reset role;
select pg_temp.verifier((select array_agg(status order by owner_id) from public.shops where owner_id::text like '22222222-%')
  = array['suspended','rejected','paused','deleted'], '4. suspendue / refusée / en pause / supprimée : statuts inchangés');
select pg_temp.verifier((select count(*) from public.admin_notifications where type = 'shop_registered') = 1, '4. aucune notification pour ces boutiques');

-- ---------------------------------------------------------------------------
-- 5. Client déjà confirmé qui crée sa boutique depuis l'application → active
-- ---------------------------------------------------------------------------
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('33333333-0000-0000-0000-000000000001', 'c1@test', now(), '{"role":"customer"}');
reset role;
insert into public.profiles (id, role, email) values ('33333333-0000-0000-0000-000000000001', 'customer', 'c1@test');
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-000000000001', false);
insert into public.shops (owner_id, name, slug, seller_code, status)
values ('33333333-0000-0000-0000-000000000001', 'Chez Fatou', 'chez-fatou', 'chezfatou', 'active');  -- 'active' demandé : ramené à 'draft' par le verrou, puis activé
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verifier((select status from public.shops where owner_id = '33333333-0000-0000-0000-000000000001') = 'active',
  '5. boutique créée par un compte confirmé : active immédiatement');
select pg_temp.verifier((select count(*) from public.admin_notifications where type = 'shop_registered') = 2, '5. notification admin créée');

-- ---------------------------------------------------------------------------
-- 6. Inscription déjà confirmée (confirmation automatique) → active
-- ---------------------------------------------------------------------------
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('44444444-0000-0000-0000-000000000001', 'v6@test', now(), '{"role":"seller","shop_name":"Auto","username":"autoconf"}');
reset role;
select pg_temp.verifier((select status from public.shops where owner_id = '44444444-0000-0000-0000-000000000001') = 'active',
  '6. inscription confirmée d''office : active');

-- ---------------------------------------------------------------------------
-- 7. Échec pendant l'activation : la confirmation passe quand même,
--    puis activate_shop_if_ready() rattrape.
-- ---------------------------------------------------------------------------
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-0000-0000-0000-000000000001', 'v7@test', '{"role":"seller","shop_name":"Rattrapage","username":"rattrapage"}');
reset role;
alter function public.notify_user(uuid, text, text, text, text, uuid, uuid, uuid, uuid) rename to notify_user_sauve;
create function public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_order_id uuid default null, p_claim_id uuid default null, p_mission_id uuid default null, p_shop_id uuid default null)
returns void language plpgsql as $$ begin raise exception 'panne simulée'; end $$;
set role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id = '55555555-0000-0000-0000-000000000001';
reset role;
select pg_temp.verifier((select email_confirmed_at is not null from auth.users where id = '55555555-0000-0000-0000-000000000001'), '7. confirmation de l''e-mail non bloquée par la panne');
select pg_temp.verifier((select status from public.shops where owner_id = '55555555-0000-0000-0000-000000000001') = 'draft', '7. activation annulée proprement (brouillon)');
drop function public.notify_user(uuid, text, text, text, text, uuid, uuid, uuid, uuid);
alter function public.notify_user_sauve(uuid, text, text, text, text, uuid, uuid, uuid, uuid) rename to notify_user;
set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-0000-0000-0000-000000000001', false);
select pg_temp.verifier((public.activate_shop_if_ready() ->> 'activated') = 'true', '7. activate_shop_if_ready rattrape l''activation');
select pg_temp.verifier((public.activate_shop_if_ready() ->> 'alreadyActive') = 'true', '7. second appel : déjà active');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verifier((select count(*) from public.admin_notifications where shop_id = (select id from public.shops where owner_id = '55555555-0000-0000-0000-000000000001')) = 1,
  '7. une notification admin après rattrapage');

-- ---------------------------------------------------------------------------
-- 8. Régularisation (section 6b du script)
-- ---------------------------------------------------------------------------
alter table auth.users disable trigger trg_activate_shops_on_email_confirmed;
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-0000-0000-0000-000000000001', 'r1@test', '{"role":"seller","shop_name":"Attente","username":"attente"}'),
  ('66666666-0000-0000-0000-000000000002', 'r2@test', '{"role":"seller","shop_name":"Brouillon confirme","username":"brouilloncf"}'),
  ('66666666-0000-0000-0000-000000000003', 'r3@test', '{"role":"seller","shop_name":"Non confirme","username":"nonconfirme"}'),
  ('66666666-0000-0000-0000-000000000004', 'r4@test', '{"role":"seller","shop_name":"Suspendue 2","username":"suspendue2"}');
update auth.users set email_confirmed_at = now() where id in ('66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000004');
reset role;
alter table auth.users enable trigger trg_activate_shops_on_email_confirmed;
select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000001', false);
update public.shops set status = 'pending' where owner_id = '66666666-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
update public.shops set status = 'suspended' where owner_id = '66666666-0000-0000-0000-000000000004';
select set_config('request.jwt.claim.sub', '', false);

select pg_temp.verifier((select count(*) from public.shops s join auth.users u on u.id = s.owner_id
  where s.status in ('draft', 'pending') and u.email_confirmed_at is not null) = 2, '8. aperçu : 2 boutiques à régulariser');

select s.id, s.name, ezial_private.activate_shop_on_email_confirmed(s.id) as activee
  from public.shops s
  join auth.users u on u.id = s.owner_id
 where s.status in ('draft', 'pending')
   and u.email_confirmed_at is not null;

select pg_temp.verifier((select array_agg(status order by owner_id) from public.shops where owner_id::text like '66666666-%')
  = array['active','active','draft','suspended'], '8. régularisation : en attente et brouillon confirmés activés, non confirmé et suspendue inchangés');
-- Relance : aucun doublon.
select ezial_private.activate_shop_on_email_confirmed(s.id) from public.shops s where s.owner_id::text like '66666666-%';
select pg_temp.verifier((select count(*) from public.admin_notifications where shop_id in (select id from public.shops where owner_id::text like '66666666-%')) = 2,
  '8. relance de la régularisation : pas de doublon');

-- ---------------------------------------------------------------------------
-- 9. Fonction interne non appelable par les rôles de l'API
-- ---------------------------------------------------------------------------
select pg_temp.verifier(not has_function_privilege('authenticated', 'ezial_private.activate_shop_on_email_confirmed(uuid)', 'execute'), '9. fonction interne fermée à authenticated');
select pg_temp.verifier(not has_function_privilege('anon', 'ezial_private.activate_shop_on_email_confirmed(uuid)', 'execute'), '9. fonction interne fermée à anon');

\echo 'TOUS LES SCÉNARIOS SONT PASSÉS'
