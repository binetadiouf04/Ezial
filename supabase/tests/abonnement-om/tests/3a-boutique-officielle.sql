-- BOUTIQUE OFFICIELLE (is_official = true, jamais modifié) : toujours Ezial Plus, aucun paiement d'abonnement possible, aucun effet de bord.
select tests.reset_abo();
select tests.put('off', to_jsonb(tests.mkshop('00000000-0000-4000-8000-0000000000d2')));
do $$
declare s uuid := tests.getid('off'); d2 uuid := '00000000-0000-4000-8000-0000000000d2'; e text; shop_before text; pid uuid := gen_random_uuid(); vid uuid := gen_random_uuid(); oid uuid;
  comm integer;
begin
  update public.shops set is_official = true, latitude = 14.70, longitude = -17.45 where id = s;
  shop_before := (select md5(row(x.*)::text) from public.shops x where id = s);
  insert into public.products (id, shop_id, name, reference, base_price) values (pid, s, 'Article officiel', 'OFF-1', 10000);
  insert into public.product_variants (id, product_id, stock) values (vid, pid, 10);

  -- Testeur ou non : tout paiement d'abonnement est refusé pour la boutique officielle
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%déjà toujours Ezial Plus%', 'Officielle : 3 mois refusé (' || e || ')');
  insert into public.payment_testers (user_id, note) values (d2, 'test');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''annual'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%déjà toujours Ezial Plus%', 'Officielle + testeur : annuel refusé');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%Périodicité d''abonnement invalide%' or e like '%déjà toujours%', 'Officielle + testeur : le plan « test_25 » n''existe plus (' || e || ')');
  perform tests.check((select count(*) from public.subscription_payment_attempts) = 0, 'Refus : rien n''est écrit');
  -- Commission des ventes officielles : toujours 0 %
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  oid := (public.create_order(jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69, 'longitude', -17.44, 'paymentMethod', 'wave',
    'items', jsonb_build_array(jsonb_build_object('productId', pid, 'variantId', vid, 'quantity', 1))))->'order'->>'id')::uuid;
  perform tests.as_system();
  comm := (select coalesce(sum(commission_amount), 0) from public.seller_transactions where order_id = oid);
  perform tests.check(comm = 0 and (select count(*) from public.seller_transactions where order_id = oid) >= 1, 'Officielle : commission 0 % (' || comm || ')');
  perform tests.check((select md5(row(x.*)::text) from public.shops x where id = s) = shop_before and (select is_official from public.shops where id = s), 'Officielle : la ligne de la boutique (dont is_official) est strictement inchangée');
  -- Expiration d'un accès d'un jour : aucune notification « retour au plan gratuit » à la boutique officielle, is_official intact
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, expiry_warned_at) values (s, 'pro', now() - interval '1 minute', false, false, true, now());
  perform public.process_subscription_expirations();
  perform tests.check(tests.n_notif(s, 'subscription_expired') = 0 and tests.n_notif(s, 'subscription_expiring_soon') = 0 and (select is_official from public.shops where id = s), 'Officielle : après expiration, aucune notification « retour au plan gratuit », is_official intact');
  update public.shops set is_official = false where id = s;
end $$;
-- nettoyage des données de ce scénario (commandes, produit de test)
select tests.reset();
delete from public.product_variants where product_id in (select id from public.products where reference = 'OFF-1');
delete from public.products where reference = 'OFF-1';
