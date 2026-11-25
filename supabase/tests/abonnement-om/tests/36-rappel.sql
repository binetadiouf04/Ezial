-- RAPPELS « 7 jours avant la fin » -> bouton Renouveler (page de paiement) ; aucune prolongation sans paiement.
select tests.reset_abo();
do $$
declare p uuid := tests.mkshop(); an uuid := tests.mkshop(); tr uuid := tests.mkshop(); far uuid := tests.mkshop(); can uuid := tests.mkshop(); ex uuid := tests.mkshop(); ex2 uuid := tests.mkshop();
  n integer; u text; b text; t text; until_before timestamptz; a uuid; r text;
begin
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period, pro_started_at) values
    (p, 'pro', now() + interval '6 days', true, true, true, 'quarterly', now() - interval '80 days'),
    (an, 'pro', now() + interval '5 days', true, true, true, 'annual', now() - interval '360 days'),
    (far, 'pro', now() + interval '8 days', true, true, true, 'quarterly', now() - interval '80 days');
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, trial_end, plan_chosen) values (tr, 'pro', now() + interval '3 days', true, now() + interval '3 days', true);
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period, cancel_requested_at) values (can, 'pro', now() + interval '4 days', true, true, true, 'quarterly', now());
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period) values (ex, 'pro', now() - interval '1 minute', true, true, true, 'quarterly');
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, plan_chosen) values (ex2, 'pro', now() - interval '1 minute', true, true);
  perform public.process_subscription_expirations();
  select url, body, title into u, b, t from public.notifications where shop_id = p and type = 'subscription_expiring_soon';
  perform tests.check(u = '/pro/seller/abonnement/paiement?periode=trimestriel', 'Rappel (trimestriel, 6 jours) : le lien mène directement au paiement (' || coalesce(u, 'aucun') || ')');
  perform tests.check(b like '%Renouveler%' and b like '%Orange Money%' and b like '%Aucun prélèvement automatique%' and t = 'Votre abonnement Ezial Plus expire bientôt', 'Rappel : texte « Renouveler » avec Orange Money, sans prélèvement automatique');
  perform tests.check((select url from public.notifications where shop_id = an and type = 'subscription_expiring_soon') = '/pro/seller/abonnement/paiement?periode=annuel', 'Rappel (annuel) : paiement annuel proposé');
  perform tests.check((select url from public.notifications where shop_id = tr and type = 'subscription_expiring_soon') = '/pro/seller/abonnement/paiement?periode=trimestriel' and (select title from public.notifications where shop_id = tr and type = 'subscription_expiring_soon') = 'Votre essai Ezial Plus se termine bientôt', 'Rappel (fin d''essai) : lien vers le paiement');
  perform tests.check(tests.n_notif(far, 'subscription_expiring_soon') = 0, 'Pas de rappel à 8 jours de la fin');
  perform tests.check(tests.n_notif(can, 'subscription_expiring_soon') = 0, 'Pas de rappel si l''abonnement est résilié (comportement d''origine)');
  perform public.process_subscription_expirations(); perform public.process_subscription_expirations();
  perform tests.check(tests.n_notif(p, 'subscription_expiring_soon') = 1, 'Rappel envoyé une seule fois (plusieurs passages de la tâche horaire)');
  perform tests.check((select expiry_warned_at from public.seller_subscriptions where shop_id = p) is not null, 'Rappel : date d''envoi enregistrée');

  -- Expiration : aucune prolongation sans paiement
  perform tests.check(not exists (select 1 from public.seller_subscriptions where shop_id = ex and pro_until > now()), 'Aucune prolongation sans paiement : la date de fin n''a pas bougé');
  perform tests.check((select downgraded_at from public.seller_subscriptions where shop_id = ex) is not null and (select plan from public.seller_subscriptions where shop_id = ex) = 'pro' and tests.n_notif(ex, 'subscription_expired') = 1, 'Expiration d''un abonnement payé : marqué « rétrogradé », vendeur prévenu (comportement d''origine)');
  perform tests.check((select plan from public.seller_subscriptions where shop_id = ex2) = 'free' and tests.n_notif(ex2, 'subscription_expired') = 1, 'Expiration d''un essai : retour au plan gratuit');

  -- Renouvellement après le rappel : le rappel de la période suivante est de nouveau possible
  until_before := (select pro_until from public.seller_subscriptions where shop_id = p);
  a := tests.attempt(p, 'quarterly'); r := tests.verify(a, 'confirmed', 6000, 'MPRAPPEL');
  perform tests.check(r = 'confirm:confirmed' and (select expiry_warned_at from public.seller_subscriptions where shop_id = p) is null and (select pro_until from public.seller_subscriptions where shop_id = p) = until_before + interval '3 months', 'Renouvellement après le rappel : prolongé de 3 mois, rappel remis à zéro');
  perform public.process_subscription_expirations();
  perform tests.check(tests.n_notif(p, 'subscription_expiring_soon') = 1, 'Après renouvellement : plus de rappel avant la prochaine période');
end $$;
