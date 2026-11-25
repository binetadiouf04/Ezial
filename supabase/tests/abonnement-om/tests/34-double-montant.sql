-- DOUBLE PAIEMENT et MONTANT INCORRECT.
select tests.reset_abo();
select tests.put('dbl', to_jsonb(tests.mkshop()));
select tests.put('bad', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('dbl'); a uuid; b uuid; c uuid; r text; end1 timestamptz; n integer;
begin
  -- A (ancien QR) puis B (nouveau QR) ; les deux sont payés
  a := tests.attempt(s, 'quarterly'); update public.subscription_payment_attempts set expires_at = now() + interval '30 seconds' where id = a; b := tests.attempt(s, 'quarterly');   -- le QR de A expire bientôt : un nouveau QR est créé
  perform tests.check(a <> b and (select status from public.subscription_payment_attempts where id = a) = 'superseded', 'Double paiement : deux QR existent pour la même boutique');
  r := tests.verify(b, 'confirmed', 6000, 'MPB'); perform tests.check(r = 'confirm:confirmed', 'Double paiement : le second QR est payé : activé');
  end1 := (tests.sub(s)).pro_until;
  r := tests.verify(a, 'confirmed', 6000, 'MPA');
  perform tests.check(r = 'confirm:duplicate_payment', 'Double paiement : le premier QR est aussi payé -> « duplicate_payment » (' || r || ')');
  perform tests.check((tests.sub(s)).pro_until = end1 and tests.n_payments(s) = 1, 'Double paiement : UNE seule activation, aucune seconde prolongation');
  perform tests.check((select status from public.subscription_payment_attempts where id = a) = 'duplicate', 'Double paiement : la tentative est marquée « duplicate »');
  perform tests.check((select count(*) from public.payment_anomalies where subscription_attempt_id = a and kind = 'double_payment') = 1 and exists (select 1 from public.ezial_events where event_type = 'finance.anomaly' and entity_id = a)
    and tests.n_admin(s, 'subscription_payment_anomaly') = 1, 'Double paiement : anomalie enregistrée, visible dans « Anomalies », administratrice prévenue');
  r := tests.verify(a, 'confirmed', 6000, 'MPA'); perform tests.check(r = 'confirm:duplicate_payment' and (select count(*) from public.payment_anomalies where subscription_attempt_id = a) = 1 and tests.n_admin(s, 'subscription_payment_anomaly') = 1,
    'Double paiement rejoué : une seule anomalie, une seule alerte');
  perform tests.check(tests.n_notif(s, 'subscription_confirmed') = 1, 'Double paiement : le vendeur n''est notifié qu''une fois');
  -- Un renouvellement VOULU plus tard n'est jamais un doublon
  c := tests.attempt(s, 'quarterly'); r := tests.verify(c, 'confirmed', 6000, 'MPC');
  perform tests.check(r = 'confirm:confirmed' and (tests.sub(s)).pro_until = end1 + interval '3 months' and tests.n_payments(s) = 2, 'Renouvellement voulu après un paiement : activé et prolongé (pas un doublon)');
end $$;

do $$
declare s uuid := tests.getid('bad'); a uuid; r text; before_sub public.seller_subscriptions; cand integer;
begin
  a := tests.attempt(s, 'quarterly');
  r := tests.verify(a, 'confirmed', 5000, 'MPBAD');
  perform tests.check(r = 'confirm:amount_mismatch', 'Montant incorrect (5 000 au lieu de 6 000) : refusé (' || r || ')');
  perform tests.check((tests.sub(s)).plan is null and tests.n_payments(s) = 0 and tests.n_notif(s, 'subscription_confirmed') = 0, 'Montant incorrect : aucune activation, aucune ligne, aucune notification vendeur');
  perform tests.check((select count(*) from public.payment_anomalies where subscription_attempt_id = a and kind = 'amount_mismatch') = 1 and tests.n_admin(s, 'subscription_payment_anomaly') = 1, 'Montant incorrect : anomalie + alerte administratrice');
  r := tests.verify(a, 'confirmed', 5000, 'MPBAD'); perform tests.check((select count(*) from public.payment_anomalies where subscription_attempt_id = a) = 1 and tests.n_admin(s, 'subscription_payment_anomaly') = 1, 'Montant incorrect répété : une seule anomalie');
  r := tests.verify(a, 'confirmed', 20000, 'MPBAD'); perform tests.check(r = 'confirm:amount_mismatch' and (tests.sub(s)).plan is null, 'Montant trop élevé (20 000 pour un trimestriel) : refusé aussi');
  r := tests.verify(a, 'confirmed', null, 'MPBAD'); perform tests.check(r = 'amount_missing', 'Montant absent : jamais de confirmation à l''aveugle');
  perform tests.check((select provider_closed_at from public.subscription_payment_attempts where id = a) is not null and not exists (select 1 from public.subscription_payments_reconcile_candidates(100) where transaction_id = a), 'Montant incorrect : la tentative n''est plus sondée (à traiter par l''administratrice)');
  -- L'administratrice, après vérification dans Orange Money, peut confirmer à la main (cas d'exception)
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  r := (public.admin_confirm_subscription_attempt(a, 'MPBAD', 'Client a payé 5 000, complément reçu'))->>'result';
  perform tests.as_system();
  perform tests.check(r = 'confirmed' and (tests.sub(s)).plan = 'pro' and (select source from public.subscription_payments where attempt_id = a) = 'admin' and (select reviewed_by from public.subscription_payments where attempt_id = a) = '00000000-0000-4000-8000-0000000000a1',
    'Cas d''exception : confirmation manuelle (référence + note) active l''abonnement, tracée « admin »');
end $$;
