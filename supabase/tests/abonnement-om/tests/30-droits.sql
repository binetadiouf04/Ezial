-- DROITS : ni anon ni un vendeur ne peuvent activer, créer une tentative, ni déclarer un paiement.
select tests.reset_abo();
select tests.put('shop', to_jsonb(tests.mkshop()));
select tests.put('att', to_jsonb(tests.attempt(tests.getid('shop'))));
do $$
declare s uuid := tests.getid('shop'); a uuid := tests.getid('att'); e text; d1 uuid := '00000000-0000-4000-8000-0000000000d1';
begin
  perform tests.as_user(d1);
  e := tests.err(format('select public.subscription_payments_confirm(%L, ''X'', 6000)', a)); perform tests.check(e like '%permission denied%', 'Droits : un vendeur connecté ne peut PAS appeler la fonction d''activation (' || e || ')');
  e := tests.err(format('select public.subscription_payments_record_verification(%L, ''confirmed'', 6000, ''X'')', a)); perform tests.check(e like '%permission denied%', 'Droits : un vendeur ne peut pas enregistrer une « vérification Orange »');
  e := tests.err(format('select ezial_private.subscription_confirm_attempt(%L, ''X'', 6000, null)', a)); perform tests.check(e like '%permission denied%', 'Droits : un vendeur ne peut pas appeler la fonction interne d''activation');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', s, d1)); perform tests.check(e like '%permission denied%', 'Droits : un vendeur ne peut pas créer lui-même une tentative');
  e := tests.err('select count(*) from public.subscription_payment_attempts'); perform tests.check(e like '%permission denied%', 'Droits : un vendeur ne lit pas la table des tentatives directement');
  e := tests.err(format('insert into public.subscription_payments (shop_id, payment_method, status) values (%L, ''orange_money'', ''pending_review'')', s)); perform tests.check(e like '%row-level security%', 'Droits : un vendeur ne peut plus déclarer un paiement fait hors du site (' || e || ')');
  e := tests.err(format('insert into public.subscription_payments (shop_id, payment_method, status) values (%L, ''orange_money'', ''confirmed'')', s)); perform tests.check(e like '%row-level security%', 'Droits : un vendeur ne peut pas s''insérer un paiement « confirmé »');
  perform tests.err(format('update public.seller_subscriptions set plan = ''pro'', pro_until = now() + interval ''1 year'' where shop_id = %L', s));
  perform tests.as_system();
  perform tests.check(not exists (select 1 from public.seller_subscriptions where shop_id = s and pro_until is not null), 'Droits : l''abonnement de la boutique n''a pas été modifié par le vendeur');

  perform tests.as_user(null, 'anon');
  e := tests.err(format('select public.subscription_payments_confirm(%L, ''X'', 6000)', a)); perform tests.check(e like '%permission denied%', 'Droits : anon ne peut PAS appeler la fonction d''activation');
  e := tests.err('select public.subscription_payments_reconcile_candidates(10)'); perform tests.check(e like '%permission denied%', 'Droits : anon ne lit pas les tentatives à rapprocher');
  e := tests.err('select public.admin_subscription_payments(10)'); perform tests.check(e like '%permission denied%', 'Droits : anon ne lit pas la liste admin');
  e := tests.err(format('select * from public.subscription_payment_return_status(%L)', a)); perform tests.check(e = 'aucune erreur', 'Droits : anon peut lire l''état d''un retour (uuid non devinable)');
  perform tests.as_system();

  -- un autre vendeur / un client
  perform tests.as_user('00000000-0000-4000-8000-0000000000d2');
  e := tests.err(format('select * from public.seller_subscription_attempt_state(%L)', s)); perform tests.check(e like '%Boutique introuvable%', 'Droits : un autre vendeur ne lit pas l''état de paiement de cette boutique');
  e := tests.err('select public.admin_subscription_payments(10)'); perform tests.check(e like '%réservé aux administrateurs%', 'Droits : un vendeur ne lit pas la liste admin');
  e := tests.err(format('select public.admin_confirm_subscription_attempt(%L, ''REF12345'')', a)); perform tests.check(e like '%réservé aux administrateurs%', 'Droits : un vendeur ne peut pas confirmer un paiement à la main');
  e := tests.err(format('select public.admin_reject_subscription_attempt(%L)', a)); perform tests.check(e like '%réservé aux administrateurs%', 'Droits : un vendeur ne peut pas refuser un paiement');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  e := tests.err('select public.admin_subscription_payments(10)'); perform tests.check(e like '%réservé aux administrateurs%', 'Droits : un client ne lit pas la liste admin');
  perform tests.as_system();
end $$;
