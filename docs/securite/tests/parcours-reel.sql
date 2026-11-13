\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
\set A '''a0000000-0000-4000-8000-000000000000'''
\set C1 '''b1000000-0000-4000-8000-000000000000'''
\set C2 '''b2000000-0000-4000-8000-000000000000'''
\set S1 '''c1000000-0000-4000-8000-000000000000'''
\set S2 '''c2000000-0000-4000-8000-000000000000'''
\set S0 '''c0000000-0000-4000-8000-000000000000'''
\set D1 '''d1000000-0000-4000-8000-000000000000'''
-- ===== préparation (vrai déclencheur d'inscription) =====
insert into public.delivery_pricing_settings default values on conflict do nothing;
insert into public.payment_settings default values on conflict do nothing;
insert into public.whatsapp_settings default values on conflict do nothing;
insert into ezial_private.seo_rebuild_state default values on conflict do nothing;
insert into auth.users(id, email, raw_user_meta_data) values
 (:A, 'admin@test.local', '{}'),
 (:C1, 'c1@test.local', '{"role":"customer","first_name":"Awa","last_name":"Client","phone":"+221770000001"}'),
 (:C2, 'c2@test.local', '{"role":"customer","first_name":"Binta","last_name":"Autre","phone":"+221770000002"}'),
 (:S1, 's1@test.local', '{"role":"seller","shop_name":"Boutique Free","username":"boutiquefree"}'),
 (:S2, 's2@test.local', '{"role":"seller","shop_name":"Boutique Plus","username":"boutiqueplus"}'),
 (:S0, 's0@test.local', '{"role":"seller","shop_name":"Ezial Officiel","username":"ezialoff"}'),
 (:D1, 'd1@test.local', '{}');
insert into public.admins(user_id) values (:A);
insert into public.profiles(id, role, username, first_name, pin_setup_required, is_suspended) values (:D1, 'driver', 'livreur1', 'Moussa', false, false);
select 'inscription: boutiques créées en brouillon', count(*), bool_and(status = 'draft') from public.shops;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000000';
update public.shops set status = 'active', latitude = 14.70, longitude = -17.45, phone = '+221770000010', description = 'Boutique de test', neighborhood = 'Plateau', pickup_enabled = true;
update public.shops set is_official = true where owner_id = :S0;
reset request.jwt.claim.sub;
select id as shop1 from public.shops where owner_id = :S1 \gset
select id as shop2 from public.shops where owner_id = :S2 \gset
select id as shop0 from public.shops where owner_id = :S0 \gset
delete from public.seller_subscriptions where shop_id in (:'shop1', :'shop2');
insert into public.seller_subscriptions(shop_id, plan, trial_used, plan_chosen) values (:'shop1', 'free', false, true);
insert into public.seller_subscriptions(shop_id, plan, trial_used, pro_until, billing_period, premium_paid_ever, plan_chosen) values (:'shop2', 'pro', true, now() + interval '60 days', 'quarterly', true, true);
insert into public.products(id, shop_id, reference, name, category, subcategory, base_price, status) values
 ('e1000000-0000-4000-8000-000000000000', :'shop1', 'EZ-T1', 'Robe test', 'vetements', 'femme', 10000, 'active'),
 ('e2000000-0000-4000-8000-000000000000', :'shop2', 'EZ-T2', 'Parfum test', 'parfums', 'parfums-femme', 20000, 'active'),
 ('e0000000-0000-4000-8000-000000000000', :'shop0', 'EZ-T0', 'Sac test', 'accessoires', 'sacs', 30000, 'active');
insert into public.product_variants(id, product_id, attributes, stock) values
 ('f1000000-0000-4000-8000-000000000000', 'e1000000-0000-4000-8000-000000000000', '{}', 5),
 ('f2000000-0000-4000-8000-000000000000', 'e2000000-0000-4000-8000-000000000000', '{}', 5),
 ('f0000000-0000-4000-8000-000000000000', 'e0000000-0000-4000-8000-000000000000', '{}', 5);
select 'produits: slug généré par le serveur', string_agg(slug, ',' order by slug) from public.products;

-- ===== 1. commande complète (vraie fonction create_order) =====
set role authenticated; set request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000000';
select 'create_order', (r->'order'->>'status') as statut, (r->'order'->>'products_subtotal') as sous_total, (r->'order'->>'delivery_fee') as frais, (r->'order'->>'total_amount') as total, jsonb_array_length(r->'shops') as boutiques
from (select public.create_order(jsonb_build_object(
  'firstName','Awa','lastName','Client','phone','+221770000001','email','c1@test.local','neighborhood','Plateau','deliveryAddress','Rue 1',
  'latitude',14.72,'longitude',-17.46,'paymentMethod','wave',
  'customerId','b2000000-0000-4000-8000-000000000000', 'unitPrice', 1,
  'shopFulfillments', jsonb_build_object(:'shop1', jsonb_build_object('type','delivery'), :'shop2', jsonb_build_object('type','delivery'), :'shop0', jsonb_build_object('type','delivery')),
  'items', jsonb_build_array(
     jsonb_build_object('productId','e1000000-0000-4000-8000-000000000000','variantId','f1000000-0000-4000-8000-000000000000','quantity',2,'selectedOptions','{}'::jsonb,'unitPrice',1),
     jsonb_build_object('productId','e2000000-0000-4000-8000-000000000000','variantId','f2000000-0000-4000-8000-000000000000','quantity',1,'selectedOptions','{}'::jsonb),
     jsonb_build_object('productId','e0000000-0000-4000-8000-000000000000','variantId','f0000000-0000-4000-8000-000000000000','quantity',1,'selectedOptions','{}'::jsonb)))) r) x;
reset role; reset request.jwt.claim.sub;
select id as ord from public.orders order by created_at desc limit 1 \gset
select 'commande: client = session (pas le customerId envoyé)', customer_id = :C1, products_subtotal, total_amount = products_subtotal + delivery_fee as total_coherent from public.orders where id = :'ord';
select 'commissions par boutique', s.name, os.subtotal, os.commission_amount, os.net_amount, os.status from public.order_shops os join public.shops s on s.id = os.shop_id where os.order_id = :'ord' order by s.name;
select 'stock décrémenté', string_agg(stock::text, ',' order by id) from public.product_variants;
select 'code dans la colonne publique orders.delivery_code', delivery_code is not null from public.orders where id = :'ord';
-- prix manipulé / quantité excessive
set role authenticated; set request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000000';
do $$ begin perform public.create_order('{"firstName":"A","lastName":"B","phone":"1","paymentMethod":"wave","latitude":14.7,"longitude":-17.4,"items":[{"productId":"e1000000-0000-4000-8000-000000000000","variantId":"f1000000-0000-4000-8000-000000000000","quantity":999}]}'::jsonb); raise notice 'commande hors stock ACCEPTEE'; exception when others then raise notice 'commande hors stock refusée: %', sqlerrm; end $$;
select 'client: obtient son code', public.ensure_order_delivery_code(:'ord') ~ '^[0-9]{4}$';
select public.ensure_order_delivery_code(:'ord') as code \gset
set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000000';
select 'autre client: voit la commande / le code', (select count(*) from public.orders where id = :'ord'), public.ensure_order_delivery_code(:'ord') is null;
-- ===== 2. vendeurs =====
set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000000';
select 'vendeur 1: voit ses lignes seulement', count(*), count(*) filter (where shop_id = :'shop1') from public.order_shops;
update public.order_shops set status = 'delivered' where shop_id = :'shop1';
update public.shops set is_official = true where id = :'shop1';
do $$ begin update public.order_shops set commission_amount = 0 where true; raise notice 'commission modifiée'; exception when others then raise notice 'commission non modifiable: %', sqlerrm; end $$;
reset role; reset request.jwt.claim.sub;
select 'après tentatives vendeur: statut / officielle', (select status from public.order_shops where order_id = :'ord' and shop_id = :'shop1'), (select is_official from public.shops where id = :'shop1');
update public.order_shops set status = 'preparing' where order_id = :'ord' and shop_id = :'shop1' and status <> 'preparing';
update public.shops set is_official = false where id = :'shop1';
set role authenticated;
set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000000'; update public.order_shops set status = 'ready' where shop_id = :'shop1' and order_id = :'ord';
set request.jwt.claim.sub = 'c2000000-0000-4000-8000-000000000000'; update public.order_shops set status = 'ready' where shop_id = :'shop2' and order_id = :'ord';
set request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000000'; update public.order_shops set status = 'ready' where shop_id = :'shop0' and order_id = :'ord';
reset role; reset request.jwt.claim.sub;
select 'mission créée quand tout est prêt', count(*), (select count(*) from public.delivery_stops), bool_and(status = 'available') from public.delivery_missions where order_id = :'ord';
select id as mis from public.delivery_missions where order_id = :'ord' \gset
select 'code dans la colonne publique delivery_missions.delivery_code', delivery_code is not null from public.delivery_missions where id = :'mis';
-- ===== 3. livreur =====
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000000';
select 'client: missions visibles', count(*) from public.delivery_missions;
set request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000000';
select 'livreur: missions visibles / code lisible', count(*), bool_or(delivery_code is not null) from public.delivery_missions;
select 'livreur: accepte', public.accept_delivery_mission(:'mis') ->> 'success';
update public.delivery_missions set driver_earning = 999999 where id = :'mis';
update public.delivery_stops set status = 'picked_up', picked_up_at = now() where mission_id = :'mis';
update public.delivery_missions set status = 'out_for_delivery' where id = :'mis';
do $$ begin update public.delivery_missions set status = 'delivered', delivered_at = now() where driver_id = auth.uid(); raise notice 'livraison directe ACCEPTEE'; exception when others then raise notice 'livraison directe refusée: %', sqlerrm; end $$;
do $$ declare r jsonb; begin r := public.driver_complete_delivery((select id from public.delivery_missions limit 1), '0000', auth.uid()::text || '/preuve.webp'); raise notice 'mauvais code -> réponse: %', r - 'lockedUntil'; exception when others then raise notice 'mauvais code -> exception: %', sqlerrm; end $$;
select 'livreur: bon code', public.driver_complete_delivery(:'mis', :'code', 'd1000000-0000-4000-8000-000000000000/preuve.webp');
reset role; reset request.jwt.claim.sub;
select 'mission après livraison', status, driver_earning, delivered_at is not null, proof_photo_path is not null from public.delivery_missions where id = :'mis';
select 'commande après livraison', (select status from public.orders where id = :'ord'), (select string_agg(status, ',' order by status) from public.order_shops where order_id = :'ord');
select 'journal financier', string_agg(action || ':' || n, ', ' order by action) from (select action, count(*) n from public.finance_audit_log group by action) z;
select 'notifications créées', (select count(*) from public.notifications), (select count(*) from public.admin_notifications), (select count(*) from public.whatsapp_notifications);
select 'appels http sortants (push)', count(*) from net.http_request_queue;
-- ===== 4. avis =====
set role authenticated; set request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000000';
do $$ begin insert into public.reviews(product_id, user_id, rating, comment) values ('e1000000-0000-4000-8000-000000000000', auth.uid(), 5, 'Très bien'); raise notice 'avis acheteur: accepté'; exception when others then raise notice 'avis acheteur: refusé (%)', sqlstate; end $$;
set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000000';
do $$ begin insert into public.reviews(product_id, user_id, rating, comment) values ('e1000000-0000-4000-8000-000000000000', auth.uid(), 1, 'Jamais acheté'); raise notice 'avis sans achat (autre client): accepté'; exception when others then raise notice 'avis sans achat (autre client): refusé (%)', sqlstate; end $$;
-- ===== 5. abonnements =====
set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000000';
select 'essai 30 jours', (public.activate_seller_trial(:'shop1')) ? 'trialEnd';
do $$ begin perform public.admin_grant_premium((select id from public.shops where owner_id = auth.uid()), 6, 'x'); raise notice 'vendeur s''offre Premium'; exception when others then raise notice 'vendeur ne peut pas s''offrir Premium: %', sqlerrm; end $$;
do $$ begin insert into public.subscription_payments(shop_id, amount, payment_method, reference, billing_period, requested_by, status) values ((select id from public.shops where owner_id = auth.uid()), 1, 'wave', 'REF1', 'quarterly', auth.uid(), 'pending_review'); raise notice 'demande de paiement d''abonnement enregistrée'; exception when others then raise notice 'demande de paiement refusée: %', sqlerrm; end $$;
do $$ begin perform public.confirm_subscription_payment((select id from public.subscription_payments limit 1)); raise notice 'vendeur confirme son paiement'; exception when others then raise notice 'vendeur ne peut pas confirmer son paiement: %', sqlerrm; end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000000';
select 'admin confirme le paiement', (public.confirm_subscription_payment((select id from public.subscription_payments limit 1))) ->> 'alreadyProcessed';
reset role; reset request.jwt.claim.sub;
select 'abonnement vendeur 1', plan, billing_period, premium_paid_ever, (select amount from public.subscription_payments limit 1) as montant_impose from public.seller_subscriptions where shop_id = :'shop1';
-- ===== 6. commande en retrait, commission Plus après abonnement =====
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000000';
select 'commande retrait', (r->'order'->>'delivery_fee') as frais, (r->'shops'->0->>'status') as statut from (select public.create_order(jsonb_build_object('firstName','Binta','lastName','Autre','phone','+221770000002','paymentMethod','orange_money',
  'shopFulfillments', jsonb_build_object(:'shop1', jsonb_build_object('type','pickup')),
  'items', jsonb_build_array(jsonb_build_object('productId','e1000000-0000-4000-8000-000000000000','variantId','f1000000-0000-4000-8000-000000000000','quantity',1,'selectedOptions','{}'::jsonb)))) r) x;
reset role; reset request.jwt.claim.sub;
select 'commission après passage Plus (8 %)', os.subtotal, os.commission_amount, os.fulfillment_type from public.order_shops os where os.shop_id = :'shop1' order by os.created_at desc limit 1;
select id as os2 from public.order_shops where fulfillment_type = 'pickup' limit 1 \gset
set role authenticated; set request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000000';
update public.order_shops set status = 'ready_for_pickup' where id = :'os2';
update public.order_shops set status = 'picked_up' where id = :'os2';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000000';
do $$ begin perform public.admin_confirm_pickup((select id from public.order_shops where fulfillment_type = 'pickup' limit 1)); raise notice 'admin confirme le retrait: ok'; exception when others then raise notice 'admin confirme le retrait: erreur %', sqlerrm; end $$;
reset role; reset request.jwt.claim.sub;
select 'retrait: statut', status from public.order_shops where id = :'os2';
set role authenticated; set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000000';
do $$ begin insert into public.reviews(product_id, user_id, rating, comment) values ('e1000000-0000-4000-8000-000000000000', auth.uid(), 4, 'Retiré en boutique'); raise notice 'avis après retrait en boutique: accepté'; exception when others then raise notice 'avis après retrait en boutique: refusé (%)', sqlstate; end $$;
do $$ begin insert into public.reviews(product_id, user_id, rating, comment) values ('e2000000-0000-4000-8000-000000000000', auth.uid(), 1, 'Jamais acheté'); raise notice 'avis sur produit jamais acheté: accepté'; exception when others then raise notice 'avis sur produit jamais acheté: refusé (%)', sqlstate; end $$;
reset role; reset request.jwt.claim.sub;
select 'éligibilité au versement après retrait confirmé', string_agg(action || ':' || n, ', ' order by action) from (select action, count(*) n from public.finance_audit_log group by action) z;
-- ===== 7. tâches planifiées =====
select 'tâches planifiées sans erreur', public.payments_maintenance() is not null or true;
do $$ begin perform public.process_subscription_expirations(); perform public.whatsapp_maintenance(); perform public.dispatch_order_reminders(); raise notice 'expirations / whatsapp / rappels: ok'; exception when others then raise notice 'tâches planifiées: ERREUR %', sqlerrm; end $$;
select 'boutiques officielles à la fin', count(*) from public.shops where is_official;
