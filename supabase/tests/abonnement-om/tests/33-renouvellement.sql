-- RENOUVELLEMENT, ESSAI, ÉQUIVALENCE avec la confirmation manuelle d'origine, PAIEMENT TARDIF.
select tests.reset_abo();
do $$
declare a uuid; s uuid; r text; before_end timestamptz; after public.seller_subscriptions; started timestamptz;
begin
  -- Renouvellement AVANT l'expiration : prolongé depuis la fin en cours
  s := tests.mkshop();
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period, expiry_warned_at)
  values (s, 'pro', now() + interval '10 days', true, now() - interval '80 days', true, true, 'quarterly', now() - interval '1 day');
  before_end := (tests.sub(s)).pro_until; started := (tests.sub(s)).pro_started_at;
  a := tests.attempt(s, 'quarterly'); r := tests.verify(a, 'confirmed', 6000, 'MPR1');
  after := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and after.pro_until = before_end + interval '3 months', 'Renouvellement avant la fin : prolongé de 3 mois DEPUIS la fin en cours (aucun jour perdu)');
  perform tests.check(after.pro_started_at = started and after.expiry_warned_at is null and after.plan = 'pro', 'Renouvellement avant la fin : début conservé, rappel remis à zéro pour la période suivante');
  -- Renouvellement annuel d'un trimestriel actif
  a := tests.attempt(s, 'annual'); r := tests.verify(a, 'confirmed', 20000, 'MPR2');
  perform tests.check((tests.sub(s)).pro_until = before_end + interval '3 months' + interval '12 months' and (tests.sub(s)).billing_period = 'annual', 'Changement de périodicité au renouvellement : prolongé de 12 mois depuis la fin');
  perform tests.check(tests.n_payments(s) = 2, 'Deux paiements = deux lignes d''historique');

  -- Renouvellement APRÈS l'expiration : depuis maintenant
  s := tests.mkshop();
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period, downgraded_at)
  values (s, 'pro', now() - interval '5 days', true, now() - interval '95 days', true, true, 'quarterly', now() - interval '4 days');
  a := tests.attempt(s, 'quarterly'); r := tests.verify(a, 'confirmed', 6000, 'MPR3'); after := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and tests.near(after.pro_until, now() + interval '3 months') and tests.near(after.pro_started_at, now()), 'Renouvellement après la fin : compté depuis maintenant (pas depuis l''ancienne date)');
  perform tests.check(after.plan = 'pro' and after.premium_paid_ever, 'Renouvellement après la fin : abonnement à nouveau actif');

  -- Retombé au plan gratuit (plan = free) puis paiement
  s := tests.mkshop();
  insert into public.seller_subscriptions (shop_id, plan, trial_used, plan_chosen) values (s, 'free', true, true);
  a := tests.attempt(s, 'annual'); r := tests.verify(a, 'confirmed', 20000, 'MPR4'); after := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and after.plan = 'pro' and tests.near(after.pro_until, now() + interval '12 months'), 'Boutique Free : paiement -> Ezial Plus pour 12 mois');
  perform tests.check((tests.sub(s)).cancel_requested_at is null, 'Aucune résiliation en attente');

  -- Résiliation demandée puis renouvellement : la résiliation est levée (déclencheur d'origine)
  s := tests.mkshop();
  insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period, cancel_requested_at)
  values (s, 'pro', now() + interval '20 days', true, true, true, 'quarterly', now() - interval '2 days');
  a := tests.attempt(s, 'quarterly'); r := tests.verify(a, 'confirmed', 6000, 'MPR5');
  perform tests.check((tests.sub(s)).cancel_requested_at is null, 'Renouveler après une résiliation : la résiliation est annulée (comportement d''origine)');

  -- Essai en cours : la période payée commence à la fin de l'essai (comportement d'origine)
  s := tests.mkshop();
  insert into public.seller_subscriptions (shop_id, plan, trial_used, trial_start, trial_end, pro_until, pro_started_at, plan_chosen)
  values (s, 'pro', true, now() - interval '20 days', now() + interval '10 days', now() + interval '10 days', now() - interval '20 days', true);
  before_end := (tests.sub(s)).pro_until;
  a := tests.attempt(s, 'quarterly'); r := tests.verify(a, 'confirmed', 6000, 'MPR6'); after := tests.sub(s);
  perform tests.check(after.pro_until = before_end + interval '3 months' and after.premium_paid_ever and after.billing_period = 'quarterly', 'Paiement pendant l''essai : 3 mois ajoutés après la fin de l''essai');
end $$;

-- Équivalence : même état de départ, confirmation manuelle d'origine ou paiement en ligne -> même abonnement
do $$
declare lg uuid; onl uuid; a uuid; pid uuid; sl public.seller_subscriptions; so public.seller_subscriptions; adm uuid := '00000000-0000-4000-8000-0000000000a1'; k integer; per text; amt integer;
begin
  for k in 1..3 loop
    per := case when k = 2 then 'annual' else 'quarterly' end; amt := case when k = 2 then 20000 else 6000 end;
    lg := tests.mkshop(); onl := tests.mkshop();
    if k <> 3 then
      insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period) select s, 'pro', now() + interval '12 days', true, now() - interval '70 days', true, true, 'quarterly' from unnest(array[lg, onl]) s;
    else
      insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, premium_paid_ever, plan_chosen, billing_period) select s, 'pro', now() - interval '3 days', true, true, true, 'quarterly' from unnest(array[lg, onl]) s;
    end if;
    insert into public.subscription_payments (shop_id, payment_method, reference, billing_period) values (lg, 'orange_money', 'LEG', per) returning id into pid;
    perform tests.as_user(adm); perform public.confirm_subscription_payment(pid); perform tests.as_system();
    a := tests.attempt(onl, per); perform tests.verify(a, 'confirmed', amt, 'EQ' || k);
    sl := tests.sub(lg); so := tests.sub(onl);
    perform tests.check(sl.plan = so.plan and sl.billing_period = so.billing_period and sl.premium_paid_ever = so.premium_paid_ever and sl.plan_chosen = so.plan_chosen and sl.trial_used = so.trial_used
      and (sl.pro_until - so.pro_until) < interval '5 seconds' and (so.pro_until - sl.pro_until) < interval '5 seconds' and (sl.pro_started_at - so.pro_started_at) < interval '5 seconds' and (so.pro_started_at - sl.pro_started_at) < interval '5 seconds'
      and sl.expiry_warned_at is not distinct from so.expiry_warned_at,
      'Équivalence n°' || k || ' : le paiement en ligne donne le même abonnement que la confirmation manuelle d''origine (' || per || ')');
    perform tests.check((select count(*) from public.notifications where shop_id in (lg, onl) and type = 'subscription_confirmed') = 2, 'Équivalence n°' || k || ' : une notification chacun');
  end loop;
end $$;

-- Paiement TARDIF : QR expiré (clos chez Orange), puis Orange confirme quand même -> abonnement activé (l'argent est reçu)
select tests.put('late', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('late'); a uuid; r text; l uuid;
begin
  a := tests.attempt(s, 'quarterly');
  update public.subscription_payment_attempts set expires_at = now() - interval '20 minutes', created_at = now() - interval '50 minutes' where id = a;
  r := tests.verify(a, 'not_found'); perform tests.check(r like 'closed:%', 'Paiement tardif : QR expiré, aucune transaction chez Orange -> tentative close « expired » (' || r || ')');
  perform tests.check((select status from public.subscription_payment_attempts where id = a) = 'expired', 'Paiement tardif : état « expired »');
  r := tests.verify(a, 'confirmed', 6000, 'MPLATE');
  perform tests.check(r = 'confirm:confirmed_late', 'Paiement tardif : Orange confirme après l''expiration -> activé quand même (' || r || ')');
  perform tests.check((tests.sub(s)).plan = 'pro' and tests.near((tests.sub(s)).pro_until, now() + interval '3 months') and tests.n_payments(s) = 1 and tests.n_notif(s, 'subscription_confirmed') = 1, 'Paiement tardif : abonnement actif, une ligne, une notification');
  perform tests.check((select message from public.admin_notifications where shop_id = s and type = 'subscription_payment_confirmed') like '%après la fin du QR%', 'Paiement tardif : l''administratrice est informée qu''il est arrivé après la fin du QR');
  perform tests.check(exists (select 1 from public.finance_audit_log where entity_id = a and action = 'subscription_payment_confirmed' and (details->>'late')::boolean), 'Paiement tardif : tracé dans le journal');
  r := tests.verify(a, 'confirmed', 6000, 'MPLATE'); perform tests.check(r = 'confirm:already_confirmed' and tests.n_payments(s) = 1, 'Paiement tardif rejoué : pas de seconde activation');
  -- Orange avait dit « refusé » puis confirme (cas rare) : activé aussi
  s := tests.mkshop(); a := tests.attempt(s);
  perform tests.verify(a, 'failed'); perform tests.check((select status from public.subscription_payment_attempts where id = a) = 'failed', 'Tentative refusée chez Orange : « failed »');
  r := tests.verify(a, 'confirmed', 6000, 'MPLATE2'); perform tests.check(r = 'confirm:confirmed_late' and (tests.sub(s)).plan = 'pro', 'Refusé puis confirmé par Orange : activé (l''argent est reçu)');
  -- QR remplacé mais l'ancien est payé alors qu'il est encore valable : activé, pas « tardif »
  s := tests.mkshop(); a := tests.attempt(s, 'quarterly'); l := tests.attempt(s, 'annual');
  perform tests.check((select status from public.subscription_payment_attempts where id = a) = 'superseded', 'Nouveau QR : l''ancien est « remplacé » mais surveillé');
  r := tests.verify(a, 'confirmed', 6000, 'MPOLD'); perform tests.check(r = 'confirm:confirmed' and (tests.sub(s)).billing_period = 'quarterly', 'Ancien QR payé pendant sa validité : activé pour ce qui a réellement été payé (trimestriel)');
end $$;
