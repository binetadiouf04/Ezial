\pset format unaligned
\pset tuples_only on
\set b1 '''b1000000-0000-0000-0000-000000000000'''
create or replace function pg_temp.t(n text, ok boolean, info text default '') returns text language sql as $$ select case when ok then 'PASS ' else 'FAIL ' end || n || case when info <> '' then ' — ' || info else '' end $$;
select pg_temp.t('reprise : code existant déplacé en table privée', (select code from ezial_private.delivery_codes where order_id='01000000-0000-0000-0000-000000000000') = '4242' and (select delivery_code from public.orders where id='01000000-0000-0000-0000-000000000000') is null);
grant execute on function pg_temp.t(text, boolean, text) to public;

-- T1 acheteur b2 → commandes de b1
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000000';
select pg_temp.t('T1 un acheteur ne voit pas la commande d''un autre', (select count(*) from public.orders where id='01000000-0000-0000-0000-000000000000') = 0 and (select count(*) from public.order_shops where order_id='01000000-0000-0000-0000-000000000000') = 0);
select pg_temp.t('T1 il voit la sienne', (select count(*) from public.orders) = 1);
-- T4 rôle admin
update public.profiles set role = 'admin' where id = auth.uid();
do $$ begin insert into public.admins(user_id) values (auth.uid()); raise notice 'FAIL T4 insertion dans admins acceptée'; exception when others then raise notice 'PASS T4 insertion dans admins refusée : %', sqlerrm; end $$;
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000000';
update public.profiles set role = 'admin' where id = auth.uid();
reset role;
select pg_temp.t('T4 le rôle ne change pas par mise à jour du profil', (select role from public.profiles where id='b1000000-0000-0000-0000-000000000000') = 'customer');

-- T2 / T6 vendeur c2
set role authenticated; set request.jwt.claim.sub = 'c2000000-0000-0000-0000-000000000000';
with u as (update public.products set name = 'piraté' where id = 'e1000000-0000-0000-0000-000000000000' returning 1) select pg_temp.t('T2 un vendeur ne modifie pas le produit d''une autre boutique', (select count(*) from u) = 0);
with u as (update public.shops set name = 'piraté' where id = '51000000-0000-0000-0000-000000000000' returning 1) select pg_temp.t('T2 ni la boutique d''un autre', (select count(*) from u) = 0);
select pg_temp.t('T2 il ne voit pas les commandes d''une autre boutique', (select count(*) from public.order_shops where shop_id = '51000000-0000-0000-0000-000000000000') = 0);
update public.shops set is_official = true, active_product_limit = 9999, suspension_reason = 'x', name = 'Boutique 2 bis' where id = '52000000-0000-0000-0000-000000000000';
reset role;
select pg_temp.t('T6 un vendeur ne peut pas se déclarer officiel (commission 0 %)', (select not is_official and active_product_limit = 25 and suspension_reason is null and name = 'Boutique 2 bis' from public.shops where id='52000000-0000-0000-0000-000000000000'), 'le nom, lui, reste modifiable');
select pg_temp.t('T6 la tentative est journalisée', (select count(*) from public.security_events where kind='privileged_column_attempt' and details->>'table'='shops') = 1);
set role authenticated; set request.jwt.claim.sub = 'c2000000-0000-0000-0000-000000000000';
do $$ begin update public.order_shops set commission_amount = 0 where id = 'f2000000-0000-0000-0000-000000000000'; raise notice 'FAIL T6 commission modifiée'; exception when others then raise notice 'PASS T6 modification de la commission refusée : %', sqlerrm; end $$;
-- étapes de commande
update public.order_shops set status = 'delivered' where id = 'f2000000-0000-0000-0000-000000000000';
reset role;
select pg_temp.t('un vendeur ne peut pas marquer « livrée »', (select status from public.order_shops where id='f2000000-0000-0000-0000-000000000000') = 'preparing');
-- nouveau compte qui crée une boutique « active » et « officielle »
set role authenticated; set request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000000';
reset role; insert into public.profiles(id, role) values ('c3000000-0000-0000-0000-000000000000','seller');
set role authenticated; set request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000000';
insert into public.shops(owner_id, name, status, is_official) values (auth.uid(), 'Boutique 3', 'active', true);
reset role;
select pg_temp.t('une boutique créée par un client démarre en brouillon, non officielle', (select status = 'draft' and not is_official from public.shops where name='Boutique 3'));

-- parcours normal : vendeur c1 prépare → prête → mission créée
set role authenticated; set request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000000';
update public.order_shops set status = 'ready' where id = 'f1000000-0000-0000-0000-000000000000';
reset role;
select pg_temp.t('parcours normal : « prête » accepté, mission créée sans code visible', (select status from public.order_shops where id='f1000000-0000-0000-0000-000000000000') = 'ready' and (select count(*) from public.delivery_missions where order_id='01000000-0000-0000-0000-000000000000' and delivery_code is null and status='available') = 1);
-- T3 mission : un client ne voit pas les missions disponibles ; un livreur oui
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000000';
select pg_temp.t('T3 un client ne voit aucune mission disponible', (select count(*) from public.delivery_missions) = 0);
set request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000000';
select pg_temp.t('T3 un livreur voit la mission disponible', (select count(*) from public.delivery_missions) = 1);
do $$ begin perform 1 from ezial_private.delivery_codes; raise notice 'FAIL le livreur lit la table des codes'; exception when others then raise notice 'PASS table des codes illisible par le livreur : %', sqlerrm; end $$;
select pg_temp.t('parcours normal : le livreur accepte la mission', (public.accept_delivery_mission((select id from public.delivery_missions limit 1))->>'success')::boolean);
reset role; select set_config('test.mission', (select id::text from public.delivery_missions limit 1), false);
set role authenticated; set request.jwt.claim.sub = 'd2000000-0000-0000-0000-000000000000';
select pg_temp.t('T3 un autre livreur ne voit plus la mission prise', (select count(*) from public.delivery_missions) = 0);
select pg_temp.t('T3 ni la commande et le téléphone du client', (select count(*) from public.orders) = 0);
-- T9 appel d'une fonction sensible sur la mission d'un autre
do $$ begin perform public.driver_complete_delivery(current_setting('test.mission')::uuid, '4242', auth.uid()::text || '/p.webp'); raise notice 'FAIL T9'; exception when others then raise notice 'PASS T9 confirmation refusée sur la mission d''un autre livreur : %', sqlerrm; end $$;
-- livreur d1 : rémunération, statuts, code
set request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000000';
update public.delivery_missions set driver_earning = 999999 where driver_id = auth.uid();
update public.delivery_missions set status = 'cancelled' where driver_id = auth.uid();
do $$ begin update public.delivery_missions set status = 'delivered', delivered_at = now() where driver_id = auth.uid(); raise notice 'FAIL livraison marquée sans code'; exception when others then raise notice 'PASS livraison directe refusée : %', sqlerrm; end $$;
update public.delivery_stops set status = 'picked_up', picked_up_at = now(), stop_order = 99 where true;
update public.delivery_missions set status = 'out_for_delivery' where driver_id = auth.uid();
select pg_temp.t('le livreur ne lit jamais le code', (select delivery_code is null from public.delivery_missions where driver_id = auth.uid()) and (select delivery_code is null from public.orders limit 1));
reset role;
select pg_temp.t('T6 le livreur ne modifie pas sa rémunération', (select driver_earning = 0 and status = 'out_for_delivery' from public.delivery_missions where order_id='01000000-0000-0000-0000-000000000000'), 'statut « annulée » refusé, « en livraison » accepté');
select pg_temp.t('arrêt : récupération acceptée, ordre verrouillé', (select status = 'picked_up' and stop_order = 1 from public.delivery_stops limit 1));
-- client b1 récupère son code
set role authenticated; set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000000';
select pg_temp.t('le client obtient son code', public.ensure_order_delivery_code('01000000-0000-0000-0000-000000000000') = '4242' and public.get_order_delivery_code('01000000-0000-0000-0000-000000000000') = '4242');
select pg_temp.t('un autre client n''obtient rien', public.ensure_order_delivery_code('02000000-0000-0000-0000-000000000000') is null);
-- T10 codes incorrects / malformés puis blocage
set request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000000';
select pg_temp.t('T10 code vide : réponse propre', (r->>'delivered')::boolean = false and r->>'error' = 'Code de livraison incorrect.' and (r->>'attemptsLeft')::int = 4, r::text) from (select public.driver_complete_delivery((select id from public.delivery_missions limit 1), null, auth.uid()::text || '/p.webp') r) x;
select public.driver_complete_delivery((select id from public.delivery_missions limit 1), '0000', auth.uid()::text || '/p.webp') from generate_series(1,3);
select pg_temp.t('T10 5e code incorrect : blocage 15 minutes', (r->>'delivered')::boolean = false and r ? 'lockedUntil', r->>'error') from (select public.driver_complete_delivery((select id from public.delivery_missions limit 1), '1111', auth.uid()::text || '/p.webp') r) x;
select pg_temp.t('T10 bon code pendant le blocage : refusé', (r->>'delivered')::boolean = false and r ? 'lockedUntil') from (select public.driver_complete_delivery((select id from public.delivery_missions limit 1), '4242', auth.uid()::text || '/p.webp') r) x;
do $$ begin perform public.driver_complete_delivery((select id from public.delivery_missions limit 1), '4242', 'autre/p.webp'); raise notice 'FAIL preuve'; exception when others then raise notice 'PASS T10 preuve photo d''un autre dossier refusée : %', sqlerrm; end $$;
reset role;
select pg_temp.t('échecs journalisés', (select count(*) filter (where kind='delivery_code_failed') = 4 and count(*) filter (where kind='delivery_code_locked') = 1 from public.security_events));
update ezial_private.delivery_codes set locked_until = now() - interval '1 minute';
set role authenticated; set request.jwt.claim.sub = 'd1000000-0000-0000-0000-000000000000';
select pg_temp.t('parcours normal : bon code après le blocage → livrée', (r->>'delivered')::boolean, r::text) from (select public.driver_complete_delivery((select id from public.delivery_missions limit 1), ' 42 42 ', auth.uid()::text || '/p.webp') r) x;
select pg_temp.t('T7 seconde confirmation : sans effet', (public.driver_complete_delivery((select id from public.delivery_missions limit 1), '4242', auth.uid()::text || '/p.webp')->>'alreadyDelivered')::boolean);
-- avis
set request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000000';
do $$ begin insert into public.reviews(product_id, user_id, rating) values ('e2000000-0000-0000-0000-000000000000', auth.uid(), 5); raise notice 'FAIL avis sans commande livrée accepté'; exception when others then raise notice 'PASS avis refusé sans produit reçu : % (%)', sqlerrm, sqlstate; end $$;
reset role; reset request.jwt.claim.sub; update public.order_shops set status = 'delivered' where id = 'f2000000-0000-0000-0000-000000000000';
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000000';
insert into public.reviews(product_id, user_id, rating) values ('e2000000-0000-0000-0000-000000000000', auth.uid(), 5);
do $$ begin insert into public.reviews(product_id, user_id, rating) values ('e1000000-0000-0000-0000-000000000000', auth.uid(), 1); raise notice 'FAIL avis sur un produit non acheté'; exception when others then raise notice 'PASS avis refusé sur un produit non acheté'; end $$;
reset role;
select pg_temp.t('avis accepté après réception du produit', (select count(*) from public.reviews) = 1);
-- T8 / catégories
do $$ begin update public.products set subcategory = '../../blog' where id = 'e1000000-0000-0000-0000-000000000000'; raise notice 'FAIL sous-catégorie piégée acceptée'; exception when others then raise notice 'PASS sous-catégorie « ../../blog » refusée'; end $$;
select pg_temp.t('T8 stockage : types et taille imposés', (select bool_and(file_size_limit is not null and not ('image/svg+xml' = any(allowed_mime_types)) and not ('text/html' = any(allowed_mime_types))) from storage.buckets where id <> 'site-content'));
-- admin garde la main
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000000';
update public.shops set is_official = true where id = '51000000-0000-0000-0000-000000000000';
reset role;
select pg_temp.t('l''administrateur peut toujours changer « officielle » (journalisé)', (select is_official from public.shops where id='51000000-0000-0000-0000-000000000000') and (select count(*) from public.security_events where kind='shop_official_changed') = 1);

-- compléments
reset role; reset request.jwt.claim.sub;
insert into public.orders(id, customer_id, total_amount, delivery_code) values ('03000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000', 1000, '7777');
select pg_temp.t('T5b commande créée avec un code : code rangé en table privée, colonne vide', (select delivery_code is null from public.orders where id='03000000-0000-0000-0000-000000000000') and (select code = '7777' from ezial_private.delivery_codes where order_id='03000000-0000-0000-0000-000000000000'));
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000000';
do $$ begin update public.reviews set product_id = 'e1000000-0000-0000-0000-000000000000' where user_id = auth.uid(); raise notice 'FAIL avis déplacé vers un produit non acheté'; exception when others then raise notice 'PASS avis non déplaçable vers un produit non acheté'; end $$;
update public.reviews set rating = 4 where user_id = auth.uid();
do $$ begin perform public.consume_api_quota(auth.uid(), 'delivery_fee', 40, 3600); raise notice 'FAIL quota appelable par un client'; exception when others then raise notice 'PASS quota non appelable par un client : %', sqlerrm; end $$;
reset role;
select pg_temp.t('modification normale de son avis toujours possible', (select rating from public.reviews limit 1) = 4);
set role service_role;
select pg_temp.t('quota : 3 appels autorisés puis refus', (select array_agg(public.consume_api_quota('b1000000-0000-0000-0000-000000000000','test',3,3600) order by g) from generate_series(1,5) g) = array[true,true,true,false,false]);
reset role;
update ezial_private.api_quotas set window_start = now() - interval '2 hours' where bucket = 'test';
set role service_role;
select pg_temp.t('quota : compteur remis à zéro après la fenêtre', public.consume_api_quota('b1000000-0000-0000-0000-000000000000','test',3,3600));
reset role;
-- journal non saturable
set role authenticated; set request.jwt.claim.sub = 'c2000000-0000-0000-0000-000000000000';
do $$ begin for i in 1..60 loop update public.shops set is_official = true where owner_id = auth.uid(); end loop; end $$;
reset role;
select pg_temp.t('journal : au plus 30 événements par acteur et par heure', (select count(*) from public.security_events where kind='privileged_column_attempt' and actor_id='c2000000-0000-0000-0000-000000000000') = 30);
select pg_temp.t('boutique toujours non officielle après 60 tentatives', not (select is_official from public.shops where id='52000000-0000-0000-0000-000000000000'));
-- insertion d'une mission avec un code (ancien chemin) : code rangé, colonne vide
insert into public.orders(id, customer_id, total_amount) values ('04000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000', 1000);
insert into public.delivery_missions(order_id, status, delivery_code, driver_earning) values ('04000000-0000-0000-0000-000000000000', 'available', '8888', 0);
select pg_temp.t('mission créée avec un code : code rangé en table privée, colonne vide', (select delivery_code is null from public.delivery_missions where order_id='04000000-0000-0000-0000-000000000000') and (select code = '8888' from ezial_private.delivery_codes where order_id='04000000-0000-0000-0000-000000000000'));
update public.orders set total_amount = 1200 where id = '03000000-0000-0000-0000-000000000000';
select pg_temp.t('mise à jour ordinaire d''une commande : inchangée par le verrou', (select total_amount = 1200 from public.orders where id='03000000-0000-0000-0000-000000000000'));
