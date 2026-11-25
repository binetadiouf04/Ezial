-- BOUTIQUE OFFICIELLE (is_official = true, jamais modifié) : seul le test_25 d'un testeur est accepté ; aucun effet de bord.
select tests.reset_abo();
select tests.put('off', to_jsonb(tests.mkshop('00000000-0000-4000-8000-0000000000d2')));
do $$
declare s uuid := tests.getid('off'); d2 uuid := '00000000-0000-4000-8000-0000000000d2'; a public.subscription_payment_attempts; e text; r text; sb public.seller_subscriptions;
  shop_before text; pid uuid := gen_random_uuid(); vid uuid := gen_random_uuid(); oid uuid; comm_before integer; comm_after integer; n_pay integer;
begin
  update public.shops set is_official = true, latitude = 14.70, longitude = -17.45 where id = s;
  shop_before := (select md5(row(x.*)::text) from public.shops x where id = s);
  insert into public.products (id, shop_id, name, reference, base_price) values (pid, s, 'Article officiel', 'OFF-1', 10000);
  insert into public.product_variants (id, product_id, stock) values (vid, pid, 10);

  -- Non testeur : tout refusé
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%réservé aux comptes testeurs%', 'Officielle + non testeur + test_25 : refusé (' || e || ')');
  insert into public.payment_testers (user_id, note) values (d2, 'test');
  -- Testeur : les vrais plans restent refusés
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%déjà toujours Ezial Plus%', 'Officielle + testeur + 3 mois : refusé (' || e || ')');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''annual'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%déjà toujours Ezial Plus%', 'Officielle + testeur + annuel : refusé');
  perform tests.check((select count(*) from public.subscription_payment_attempts) = 0, 'Refus : rien n''est écrit');
  -- Commission avant : 0 % (boutique officielle)
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  oid := (public.create_order(jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69, 'longitude', -17.44, 'paymentMethod', 'wave',
    'items', jsonb_build_array(jsonb_build_object('productId', pid, 'variantId', vid, 'quantity', 1))))->'order'->>'id')::uuid;
  perform tests.as_system();
  comm_before := (select coalesce(sum(commission_amount), 0) from public.seller_transactions where order_id = oid);
  perform tests.check(comm_before = 0 and (select count(*) from public.seller_transactions where order_id = oid) >= 1, 'Officielle : commission 0 % avant le test (' || comm_before || ')');

  -- Testeur + test_25 : accepté
  a := public.subscription_payments_create_attempt(s, 'test_25', 'orange_money', d2);
  perform tests.check(a.amount = 25 and a.billing_period = 'test_25', 'Officielle + testeur + test_25 : accepté, 25 FCFA (calculé par la base)');
  perform public.subscription_payments_set_pending(a.id, a.id::text, null, now() + interval '30 minutes');
  r := tests.verify(a.id, 'confirmed', 6000, 'MPO0'); perform tests.check(r = 'confirm:amount_mismatch' and (tests.sub(s)).plan is null, 'Officielle : montant ≠ 25 refusé, aucune activation');
  update public.subscription_payment_attempts set provider_closed_at = null where id = a.id;
  r := tests.verify(a.id, 'confirmed', 25, 'MPO1'); sb := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and sb.plan = 'pro' and tests.near(sb.pro_until, now() + interval '1 day'), 'Officielle : activation à la confirmation, pro_until = maintenant + 1 jour');
  perform tests.check(sb.premium_paid_ever = false and sb.trial_used = false and sb.billing_period is null, 'Officielle : premium_paid_ever, trial_used et périodicité inchangés');
  perform tests.check((select md5(row(x.*)::text) from public.shops x where id = s) = shop_before and (select is_official from public.shops where id = s), 'Officielle : la ligne de la boutique (dont is_official) est strictement inchangée');
  select count(*) into n_pay from public.subscription_payments where shop_id = s; perform tests.check(n_pay = 0, 'Officielle : aucune ligne dans l''historique des paiements');
  perform tests.check(tests.n_notif(s, 'subscription_confirmed') = 1, 'Officielle : notification de confirmation envoyée une fois');
  -- Commande après activation : commission toujours 0 %
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  oid := (public.create_order(jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69, 'longitude', -17.44, 'paymentMethod', 'wave',
    'items', jsonb_build_array(jsonb_build_object('productId', pid, 'variantId', vid, 'quantity', 1))))->'order'->>'id')::uuid;
  perform tests.as_system();
  comm_after := (select coalesce(sum(commission_amount), 0) from public.seller_transactions where order_id = oid);
  perform tests.check(comm_after = 0, 'Officielle : commission toujours 0 % après le test (aucun effet sur les ventes)');
  -- Idempotence
  r := tests.verify(a.id, 'confirmed', 25, 'MPO1'); perform tests.check(r = 'confirm:already_confirmed' and tests.near((tests.sub(s)).pro_until, now() + interval '1 day') and tests.n_notif(s, 'subscription_confirmed') = 1, 'Officielle : rejeu sans seconde activation');
  -- Expiration : retour de la ligne à « free » SANS notification parasite à la boutique officielle
  update public.seller_subscriptions set pro_until = now() - interval '1 minute' where shop_id = s;
  perform public.process_subscription_expirations();
  perform tests.check(tests.n_notif(s, 'subscription_expired') = 0 and tests.n_notif(s, 'subscription_expiring_soon') = 0 and (select is_official from public.shops where id = s), 'Officielle : après 1 jour, aucune notification « retour au plan gratuit » ni rappel, is_official intact');
  -- Retiré des testeurs : refusé de nouveau
  delete from public.payment_testers;
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%réservé aux comptes testeurs%', 'Officielle : retirée des testeurs -> refusé');
  -- Une boutique normale reste inchangée : le message officiel ne s'applique pas
  update public.shops set is_official = false where id = s;
end $$;
-- nettoyage des données de ce scénario (commandes, produit de test)
select tests.reset();
delete from public.product_variants where product_id in (select id from public.products where reference = 'OFF-1');
delete from public.products where reference = 'OFF-1';
