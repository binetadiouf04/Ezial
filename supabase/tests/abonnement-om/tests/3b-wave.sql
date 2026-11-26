-- WAVE : le vendeur peut payer son abonnement avec Wave (même chaîne que Orange Money) ; fermé tant que Wave n'est pas activé.
select tests.reset_abo();
select tests.put('w1', to_jsonb(tests.mkshop()));
select tests.put('w2', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('w1'); o uuid := tests.getid('w2'); d1 uuid := '00000000-0000-4000-8000-0000000000d1'; a public.subscription_payment_attempts; b public.subscription_payment_attempts;
  e text; r text; sb public.seller_subscriptions; st record; n integer;
begin
  -- Wave fermé (aucune colonne wave_enabled, aucun testeur Wave) : refusé sans rien écrire ; Orange Money reste ouvert
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''wave'', %L)', s, d1));
  perform tests.check(e like '%en cours d''activation%', 'Wave fermé : refusé « en cours d''activation » (' || e || ')');
  perform tests.check((select count(*) from public.subscription_payment_attempts) = 0, 'Wave fermé : rien n''est écrit');
  perform tests.check((public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1)).provider = 'orange_money', 'Orange Money reste ouvert');
  delete from public.subscription_payment_attempts;
  -- Moyen inconnu et plan de test disparu
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''paypal'', %L)', s, d1));
  perform tests.check(e like '%Moyen de paiement inconnu%', 'Moyen inconnu refusé');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''test_25'', ''orange_money'', %L)', s, d1));
  perform tests.check(e like '%Périodicité d''abonnement invalide%', 'Plan « test_25 » : n''existe plus (' || e || ')');
  e := tests.err('select public.subscription_test_plan_available()');
  perform tests.check(e like '%does not exist%', 'Fonction de test supprimée');

  -- Wave ouvert (interrupteur de la migration Wave simulé)
  alter table public.payment_settings add column if not exists wave_enabled boolean not null default false;
  update public.payment_settings set wave_enabled = true;
  a := public.subscription_payments_create_attempt(s, 'quarterly', 'wave', d1);
  perform tests.check(a.provider = 'wave' and a.amount = 6000 and a.status = 'initiated', 'Wave ouvert : tentative créée, 6 000 FCFA calculés par la base');
  perform tests.check((public.subscription_payments_create_attempt(s, 'quarterly', 'wave', d1)).id = a.id, 'Wave : tentative ouverte réutilisée');
  perform public.subscription_payments_set_pending(a.id, 'cos-WAVE0001', 'https://pay.wave.com/c/cos-WAVE0001', now() + interval '30 minutes');
  perform tests.check((select checkout_url from public.subscription_payment_attempts where id = a.id) = 'https://pay.wave.com/c/cos-WAVE0001' and (select provider_reference from public.subscription_payment_attempts where id = a.id) = 'cos-WAVE0001', 'Wave : page de paiement et session enregistrées');
  perform tests.check((public.subscription_payments_create_attempt(s, 'quarterly', 'wave', d1)).id = a.id, 'Wave : session encore valable réutilisée');

  -- Rapprochement : par moyen ; Wave = identifiant de la session
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10, 'wave') where transaction_id = a.id and reference = 'cos-WAVE0001' and provider = 'wave') = 1, 'Rapprochement Wave : référence = session Wave');
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10) where transaction_id = a.id) = 0, 'Rapprochement sans moyen précisé : Orange Money seulement (fonction Edge déjà déployée)');
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10, 'orange_money') where transaction_id = a.id) = 0, 'Rapprochement Orange Money : ne renvoie pas une tentative Wave');
  -- État lu par le vendeur
  perform tests.as_user(d1); select * into st from public.seller_subscription_attempt_state(s); perform tests.as_system();
  perform tests.check(st.attempt_id = a.id and st.payment_state = 'pending' and st.provider = 'wave', 'Vendeur : l''état de la tentative indique Wave');

  -- Confirmation : Wave « en attente » n'active rien ; mauvais montant refusé ; bon montant activé une fois
  r := tests.verify(a.id, 'pending'); perform tests.check(r = 'waiting' and (tests.sub(s)).plan is null, 'Wave « en attente » : rien n''est activé');
  r := tests.verify(a.id, 'confirmed', 600); perform tests.check(r = 'confirm:amount_mismatch' and (tests.sub(s)).plan is null, 'Wave : montant incorrect refusé, aucune activation');
  update public.subscription_payment_attempts set provider_closed_at = null where id = a.id;
  r := tests.verify(a.id, 'confirmed', 6000, 'TWAVE0001');
  sb := tests.sub(s);
  perform tests.check(r = 'confirm:confirmed' and sb.plan = 'pro' and sb.billing_period = 'quarterly' and tests.near(sb.pro_until, now() + interval '3 months'), 'Wave : confirmé, abonnement actif 3 mois');
  perform tests.check((select payment_method from public.subscription_payments where attempt_id = a.id) = 'wave' and tests.n_payments(s) = 1, 'Wave : une seule ligne d''historique, moyen « wave »');
  perform tests.check((select message from public.admin_notifications where shop_id = s and type = 'subscription_payment_confirmed') like '%via Wave%', 'Administratrice : le message nomme Wave');
  r := tests.verify(a.id, 'confirmed', 6000, 'TWAVE0001'); perform tests.check(r = 'confirm:already_confirmed' and tests.n_payments(s) = 1 and tests.n_notif(s, 'subscription_confirmed') = 1, 'Wave : rejeu sans seconde activation');

  -- Échec Wave : message au bon nom ; nouvelle tentative d'un autre moyen : l'ancienne reste surveillée
  b := public.subscription_payments_create_attempt(o, 'annual', 'wave', d1);
  perform public.subscription_payments_set_pending(b.id, 'cos-WAVE0002', 'https://pay.wave.com/c/cos-WAVE0002', now() + interval '30 minutes');
  b := public.subscription_payments_create_attempt(o, 'annual', 'orange_money', d1);
  perform tests.check((select status from public.subscription_payment_attempts where provider_reference = 'cos-WAVE0002') = 'superseded', 'Wave remplacée par Orange Money : reste « superseded » (surveillée), pas annulée à l''aveugle');
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10, 'wave') where reference = 'cos-WAVE0002') = 1, 'La session Wave remplacée reste à rapprocher');
  r := tests.verify((select id from public.subscription_payment_attempts where provider_reference = 'cos-WAVE0002'), 'failed');
  perform tests.check(r like 'fail:%' and (select failure_reason from public.subscription_payment_attempts where provider_reference = 'cos-WAVE0002') like '%Statut Wave : failed%', 'Wave : échec enregistré avec le nom du moyen (' || r || ')');

  -- Nettoyage : Wave refermé
  update public.payment_settings set wave_enabled = false;
  alter table public.payment_settings drop column wave_enabled;
end $$;
select tests.reset_abo();
