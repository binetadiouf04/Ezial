-- ACTIVATION : paiement confirmé par Orange -> abonnement actif (3 mois et annuel, prix exacts), une seule fois.
select tests.reset_abo();
select tests.put('q', to_jsonb(tests.mkshop()));
select tests.put('y', to_jsonb(tests.mkshop()));
do $$
declare q uuid := tests.getid('q'); y uuid := tests.getid('y'); aq uuid; ay uuid; r text; s public.seller_subscriptions; p public.subscription_payments; n integer; owner uuid := '00000000-0000-4000-8000-0000000000d1';
begin
  aq := tests.attempt(q, 'quarterly'); ay := tests.attempt(y, 'annual');
  perform tests.put('aq', to_jsonb(aq)); perform tests.put('ay', to_jsonb(ay));
  r := tests.verify(aq, 'pending'); perform tests.check(r = 'waiting' and (tests.sub(q)).plan is null, 'Orange « en attente » : rien n''est activé');
  perform tests.check(tests.n_payments(q) = 0 and tests.n_notif(q, 'subscription_confirmed') = 0, 'Avant confirmation : aucune ligne de paiement, aucune notification');

  r := tests.verify(aq, 'confirmed', 6000, 'MP260101.AAAA.B1');
  perform tests.check(r = 'confirm:confirmed', 'Trimestriel : confirmé par Orange (6 000 FCFA)');
  s := tests.sub(q);
  perform tests.check(s.plan = 'pro' and s.billing_period = 'quarterly' and s.premium_paid_ever and s.plan_chosen and s.trial_used and s.expiry_warned_at is null and s.pro_started_at is not null,
    'Trimestriel : abonnement actif (plan pro, périodicité, premium_paid_ever, plan_chosen)');
  perform tests.check(tests.near(s.pro_until, now() + interval '3 months') and tests.near(s.pro_started_at, now()), 'Trimestriel : valable 3 mois à partir de maintenant');
  p := (select x from public.subscription_payments x where shop_id = q);
  perform tests.check(p.status = 'confirmed' and p.amount = 6000 and p.payment_method = 'orange_money' and p.billing_period = 'quarterly' and p.source = 'online' and p.attempt_id = aq and p.reference = 'MP260101.AAAA.B1' and p.period_end = s.pro_until and p.reviewed_by is null,
    'Historique : ligne « confirmed », 6 000 FCFA, Orange Money, référence Orange, période = fin d''abonnement');
  perform tests.check((select status from public.subscription_payment_attempts where id = aq) = 'confirmed' and (select confirmed_at from public.subscription_payment_attempts where id = aq) is not null and (select provider_closed_at from public.subscription_payment_attempts where id = aq) is not null,
    'Tentative : « confirmed », close');
  perform tests.check(tests.n_notif(q, 'subscription_confirmed') = 1, 'Vendeur : une notification « Abonnement Ezial Plus activé »');
  perform tests.check((select body from public.notifications where shop_id = q and type = 'subscription_confirmed') like '%trimestriel (3 mois)%valide jusqu''au ' || to_char(s.pro_until, 'DD/MM/YYYY') || '.', 'Vendeur : texte identique à la confirmation manuelle d''origine');
  perform tests.check(tests.n_admin(q, 'subscription_payment_confirmed') = 1 and tests.n_admin(q, 'subscription_payment_pending') = 0, 'Administratrice : une alerte « payé en ligne », pas de fausse « nouvelle demande »');
  perform tests.check((select message from public.admin_notifications where shop_id = q and type = 'subscription_payment_confirmed') like '%6000 FCFA, trimestriel, via Orange Money%', 'Administratrice : le message nomme le montant, la périodicité et Orange Money');
  perform tests.check(exists (select 1 from public.finance_audit_log where action = 'subscription_payment_confirmed' and entity_id = aq and (details->>'late')::boolean = false and (details->>'manual')::boolean = false), 'Journal d''audit : activation enregistrée');

  -- Annuel
  r := tests.verify(ay, 'confirmed', 20000, 'MP260101.AAAA.B2');
  perform tests.check(r = 'confirm:confirmed', 'Annuel : confirmé par Orange (20 000 FCFA)');
  s := tests.sub(y); p := (select x from public.subscription_payments x where shop_id = y);
  perform tests.check(s.plan = 'pro' and s.billing_period = 'annual' and tests.near(s.pro_until, now() + interval '12 months') and p.amount = 20000 and p.billing_period = 'annual', 'Annuel : valable 12 mois, 20 000 FCFA');

  -- Webhook rejoué / rapprochement qui repasse : aucune seconde activation
  for n in 1..3 loop
    r := tests.verify(aq, 'confirmed', 6000, 'MP260101.AAAA.B1');
    perform tests.check(r = 'confirm:already_confirmed', 'Rejeu n°' || n || ' : « déjà confirmé », rien ne change');
  end loop;
  r := public.subscription_payments_confirm(aq, 'MP260101.AAAA.B1', 6000);
  perform tests.check(r = 'already_confirmed', 'Appel direct répété : « déjà confirmé »');
  perform tests.check(tests.n_payments(q) = 1 and tests.near((tests.sub(q)).pro_until, now() + interval '3 months') and tests.n_notif(q, 'subscription_confirmed') = 1 and tests.n_admin(q, 'subscription_payment_confirmed') = 1,
    'Après 4 rejeux : une seule ligne de paiement, pas de double prolongation, une seule notification vendeur et administratrice');
  r := public.subscription_payments_confirm(gen_random_uuid(), 'X', 6000); perform tests.check(r = 'not_found', 'Tentative inconnue : « not_found »');
  r := tests.verify(aq, 'confirmed', null); perform tests.check(r = 'amount_missing' or r = 'confirm:already_confirmed', 'Sans montant : jamais de confirmation à l''aveugle');
end $$;
