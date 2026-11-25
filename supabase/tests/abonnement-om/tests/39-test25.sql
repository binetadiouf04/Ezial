-- PLAN DE TEST « test_25 » : 25 FCFA, comptes testeurs seulement, 1 jour, même chaîne que les vrais plans.
select tests.reset_abo();
select tests.put('t1', to_jsonb(tests.mkshop()));
select tests.put('t2', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('t1'); d1 uuid := '00000000-0000-4000-8000-0000000000d1'; a public.subscription_payment_attempts; aid uuid; r text; sb public.seller_subscriptions; e text; ok boolean;
begin
  -- Non-testeur : refusé, interrupteur Orange Money allumé ou non, rien n'est écrit
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d1));
  perform tests.check(e like '%réservé aux comptes testeurs%', 'Test 25 : un compte qui n''est pas testeur est refusé (' || e || ')');
  perform tests.check((select count(*) from public.subscription_payment_attempts) = 0, 'Test 25 : refus sans rien écrire');
  perform tests.as_user(d1);
  perform tests.check(public.subscription_test_plan_available() = false, 'Test 25 : l''option n''est pas annoncée à un vendeur normal');
  perform tests.as_system();
  -- Testeur : accepté
  insert into public.payment_testers (user_id, note) values (d1, 'test');
  perform tests.as_user(d1); perform tests.check(public.subscription_test_plan_available() = true, 'Test 25 : l''option est annoncée à un testeur (réponse serveur)'); perform tests.as_system();
  a := public.subscription_payments_create_attempt(s, 'test_25', 'orange_money', d1);
  perform tests.check(a.amount = 25 and a.billing_period = 'test_25' and a.status = 'initiated', 'Test 25 : testeur accepté, montant calculé par la base = 25 FCFA');
  perform tests.check((public.subscription_payments_create_attempt(s, 'test_25', 'orange_money', d1)).id = a.id, 'Test 25 : tentative ouverte réutilisée');
  perform public.subscription_payments_set_pending(a.id, a.id::text, null, now() + interval '30 minutes');
  -- Montant ≠ 25 : refusé
  r := tests.verify(a.id, 'confirmed', 6000, 'MPT0'); perform tests.check(r = 'confirm:amount_mismatch' and (tests.sub(s)).plan is null, 'Test 25 : montant ≠ 25 (6 000) refusé, aucune activation');
  update public.subscription_payment_attempts set provider_closed_at = null where id = a.id;
  r := tests.verify(a.id, 'confirmed', 20, 'MPT0'); perform tests.check(r = 'confirm:amount_mismatch' and (tests.sub(s)).plan is null, 'Test 25 : montant ≠ 25 (20) refusé');
  r := tests.verify(a.id, 'confirmed', 25, 'MPT1');
  perform tests.check(r = 'confirm:confirmed', 'Test 25 : 25 FCFA confirmés par Orange -> activé');
  sb := tests.sub(s);
  perform tests.check(sb.plan = 'pro' and tests.near(sb.pro_until, now() + interval '1 day') and sb.pro_until - now() < interval '1 day 1 minute', 'Test 25 : durée exacte de 1 jour');
  perform tests.check(sb.premium_paid_ever = false and sb.trial_used = false and sb.billing_period is null and sb.plan_chosen, 'Test 25 : premium_paid_ever et trial_used inchangés (l''essai gratuit reste disponible)');
  perform tests.check(tests.n_payments(s) = 0, 'Test 25 : aucune ligne dans l''historique des paiements (statistiques non faussées)');
  perform tests.check(tests.n_notif(s, 'subscription_confirmed') = 1 and (select body from public.notifications where shop_id = s and type = 'subscription_confirmed') like '%de test (25 FCFA, 1 jour)%', 'Test 25 : notification vendeur envoyée (libellé « test »)');
  perform tests.check(tests.n_admin(s, 'subscription_payment_confirmed') = 1 and (select message from public.admin_notifications where shop_id = s and type = 'subscription_payment_confirmed') like '%TEST, 1 jour%', 'Test 25 : alerte administratrice marquée TEST');
  -- Idempotence
  for aid in select unnest(array[a.id, a.id, a.id]) loop r := tests.verify(aid, 'confirmed', 25, 'MPT1'); end loop;
  perform tests.check(r = 'confirm:already_confirmed' and tests.near((tests.sub(s)).pro_until, now() + interval '1 day') and tests.n_notif(s, 'subscription_confirmed') = 1, 'Test 25 : rejeu sans seconde activation ni notification');
  -- Page de retour et liste admin
  perform tests.as_user(null, 'anon');
  perform tests.check((select payment_state from public.subscription_payment_return_status(a.id)) = 'paid' and (select period_end from public.subscription_payment_return_status(a.id)) is not null, 'Test 25 : page de retour « paid » avec date de fin');
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  perform tests.check(exists (select 1 from jsonb_array_elements(public.admin_subscription_payments(50)) x where x->>'billing_period' = 'test_25' and (x->>'amount')::int = 25 and x->>'state' = 'confirmed'), 'Test 25 : visible dans la liste admin (25 FCFA, test_25, confirmé)');
  perform tests.as_system();
  -- Expiration par le mécanisme normal : plan gratuit, aucune prolongation
  update public.seller_subscriptions set pro_until = now() - interval '1 minute' where shop_id = s;
  perform public.process_subscription_expirations();
  perform tests.check((tests.sub(s)).plan = 'free' and (tests.sub(s)).pro_until < now() and tests.n_notif(s, 'subscription_expired') = 1 and tests.n_notif(s, 'subscription_expiring_soon') = 0, 'Test 25 : après 1 jour, retour au plan gratuit par le mécanisme normal (aucun rappel « 7 jours » parasite)');
  -- Un testeur dont la boutique a déjà un abonnement réel plus long : jamais raccourci
  s := tests.getid('t2');
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period, pro_started_at) values (s, 'pro', now() + interval '60 days', true, true, true, 'quarterly', now() - interval '30 days');
  a := public.subscription_payments_create_attempt(s, 'test_25', 'orange_money', d1);
  perform public.subscription_payments_set_pending(a.id, a.id::text, null, now() + interval '30 minutes');
  r := tests.verify(a.id, 'confirmed', 25, 'MPT2'); sb := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and sb.pro_until > now() + interval '59 days' and sb.billing_period = 'quarterly' and sb.premium_paid_ever, 'Test 25 sur un abonnement réel plus long : la date de fin n''est jamais raccourcie');
  -- Un vrai plan n'a pas changé : trimestriel toujours 6 000 / 3 mois (autre boutique)
  delete from public.payment_testers;
  s := tests.mkshop(); a := public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1);
  perform tests.check(a.amount = 6000, 'Plans réels inchangés : trimestriel 6 000 FCFA, jamais 25');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d1));
  perform tests.check(e like '%réservé aux comptes testeurs%', 'Test 25 : retiré des testeurs -> refusé de nouveau');
end $$;
