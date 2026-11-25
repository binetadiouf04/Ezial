-- STATUTS ORANGE, RAPPROCHEMENT, PAGE DE RETOUR, ÉTAT VENDEUR, ADMINISTRATION.
select tests.reset_abo();
select tests.put('v1', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('v1'); a uuid; r text; n integer; ret record; adm uuid := '00000000-0000-4000-8000-0000000000a1'; d1 uuid := '00000000-0000-4000-8000-0000000000d1'; j jsonb; e text; ord uuid;
begin
  a := tests.attempt(s);
  r := tests.verify(a, 'unknown'); perform tests.check(r = 'waiting', 'Statut inconnu : aucun changement');
  r := tests.verify(a, 'not_found'); perform tests.check(r = 'waiting', 'Introuvable avant la fin du QR : on attend (jamais « échoué » sans preuve)');
  perform tests.check((select check_count from public.subscription_payment_attempts where id = a) = 2 and (select verified_status from public.subscription_payment_attempts where id = a) = 'not_found', 'Nombre de contrôles et dernier statut enregistrés');
  e := tests.err(format('select public.subscription_payments_record_verification(%L, ''inventé'')', a)); perform tests.check(e like '%Statut invalide%', 'Statut invalide refusé');
  update public.subscription_payment_attempts set last_checked_at = null where id = a;
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10) where transaction_id = a and order_id is null and reference = a::text) = 1, 'Rapprochement : la tentative en attente est à vérifier (référence = identifiant de la tentative)');
  update public.subscription_payment_attempts set last_checked_at = now() where id = a;
  perform tests.check((select count(*) from public.subscription_payments_reconcile_candidates(10) where transaction_id = a) = 0, 'Rapprochement : pas de nouvelle vérification avant 45 secondes');

  -- Page de retour (anon) : états
  perform tests.as_user(null, 'anon');
  select * into ret from public.subscription_payment_return_status(a); perform tests.check(ret.payment_state = 'pending' and ret.period_end is null, 'Retour : « pending » tant que rien n''est confirmé');
  select count(*) into n from public.subscription_payment_return_status(gen_random_uuid()); perform tests.check(n = 0, 'Retour : identifiant inconnu -> aucune ligne');
  perform tests.as_system();
  r := tests.verify(a, 'confirmed', 6000, 'MPRET');
  perform tests.as_user(null, 'anon');
  select * into ret from public.subscription_payment_return_status(a); perform tests.check(ret.payment_state = 'paid' and ret.billing_period = 'quarterly' and ret.period_end is not null, 'Retour : « paid » + date de fin après confirmation');
  perform tests.as_system();
  perform tests.check((select array_agg(a2) from (select unnest(proargnames) a2 from pg_proc where proname = 'subscription_payment_return_status') x where a2 <> 'p_ref') @> array['payment_state', 'billing_period', 'period_end'] and cardinality((select proargnames from pg_proc where proname = 'subscription_payment_return_status')) = 4,
    'Retour : seulement état, périodicité et date de fin (aucun montant, nom, numéro ni référence)');
  -- Autres états
  a := tests.attempt(tests.mkshop()); perform tests.verify(a, 'failed'); perform tests.as_user(null, 'anon');
  perform tests.check((select payment_state from public.subscription_payment_return_status(a)) = 'failed', 'Retour : « failed » quand Orange refuse'); perform tests.as_system();
  a := tests.attempt(tests.mkshop()); update public.subscription_payment_attempts set expires_at = now() - interval '1 hour', created_at = now() - interval '2 hours' where id = a; perform tests.verify(a, 'not_found');
  perform tests.as_user(null, 'anon'); perform tests.check((select payment_state from public.subscription_payment_return_status(a)) = 'expired', 'Retour : « expired » quand le QR est clos sans paiement'); perform tests.as_system();

  -- État vendeur
  perform tests.as_user(d1);
  select * into ret from public.seller_subscription_attempt_state(s); perform tests.check(ret.payment_state = 'paid' and ret.attempt_id is not null, 'Vendeur : retrouve l''état de sa dernière tentative');
  perform tests.as_system();

  -- Administration
  perform tests.as_user(adm);
  j := public.admin_subscription_payments(50);
  perform tests.check(jsonb_typeof(j) = 'array' and jsonb_array_length(j) >= 3 and (select bool_and(x->>'provider' in ('orange_money', 'wave')) from jsonb_array_elements(j) x), 'Admin : liste des paiements d''abonnement avec leur moyen (Orange Money / Wave, jamais d''espèces)');
  perform tests.check(exists (select 1 from jsonb_array_elements(j) x where x->>'state' = 'confirmed' and (x->>'amount')::int = 6000 and x->>'reference' = 'MPRET' and x->>'shop_name' like 'Abo %'), 'Admin : paiement confirmé avec montant, référence et boutique');
  perform tests.check(exists (select 1 from jsonb_array_elements(j) x where x->>'state' = 'failed') and exists (select 1 from jsonb_array_elements(j) x where x->>'state' = 'expired'), 'Admin : états « refusé » et « expiré » visibles');
  perform tests.as_system();
  -- ligne héritée (avant ce changement) : visible, en lecture
  insert into public.subscription_payments (shop_id, payment_method, reference, status, billing_period, reviewed_at, period_start, period_end) values ('00000000-0000-4000-8000-0000000000b1', 'wave', 'ANCIEN', 'confirmed', 'quarterly', now(), now(), now() + interval '3 months');
  perform tests.as_user(adm); j := public.admin_subscription_payments(50);
  perform tests.check(exists (select 1 from jsonb_array_elements(j) x where x->>'kind' = 'legacy' and x->>'provider' = 'wave' and x->>'reference' = 'ANCIEN' and (x->>'can_confirm')::boolean = false), 'Admin : l''ancien paiement (hérité) reste lisible');
  perform tests.as_system();

  -- Refus et confirmation manuelle (cas d'exception)
  s := tests.mkshop(); a := tests.attempt(s);
  perform tests.as_user(adm);
  e := tests.err(format('select public.admin_confirm_subscription_attempt(%L, '''')', a)); perform tests.check(e like '%référence%', 'Confirmation manuelle : la référence de la transaction est obligatoire');
  e := tests.err(format('select public.admin_confirm_subscription_attempt(%L, ''ab'')', a)); perform tests.check(e like '%référence%', 'Confirmation manuelle : une référence trop courte est refusée');
  e := tests.err(format('select public.admin_confirm_subscription_attempt(%L, ''REF-OM-1'')', gen_random_uuid())); perform tests.check(e like '%introuvable%', 'Confirmation manuelle : tentative inconnue refusée');
  j := public.admin_reject_subscription_attempt(a, 'Aucun paiement reçu'); perform tests.check((j->>'alreadyProcessed') = 'false' and tests.astatus(a) = 'cancelled', 'Refus manuel : tentative annulée');
  perform tests.check(tests.n_notif(s, 'subscription_rejected') = 1, 'Refus manuel : le vendeur est prévenu');
  j := public.admin_reject_subscription_attempt(a, 'Aucun paiement reçu'); perform tests.check((j->>'alreadyProcessed') = 'true' and tests.n_notif(s, 'subscription_rejected') = 1, 'Refus répété : sans effet, le vendeur n''est pas prévenu deux fois');
  perform tests.check((tests.sub(s)).plan is null, 'Refus manuel : aucun abonnement accordé');
  j := public.admin_confirm_subscription_attempt(a, 'REF-OM-1', 'Reçu dans Orange Money à 14h02');
  perform tests.check((j->>'success') = 'true' and (tests.sub(s)).plan = 'pro' and tests.anote(a) = 'Reçu dans Orange Money à 14h02', 'Confirmation manuelle après refus (paiement reçu, non rapproché) : activé, note enregistrée');
  j := public.admin_confirm_subscription_attempt(a, 'REF-OM-1'); perform tests.check((j->>'already') = 'true' and tests.n_payments(s) = 1, 'Confirmation manuelle rejouée : « déjà confirmé », une seule ligne');
  j := public.admin_reject_subscription_attempt(a); perform tests.check((j->>'alreadyProcessed') = 'true', 'Refus d''un paiement déjà confirmé : sans effet');
  perform tests.check((select message from public.admin_notifications where shop_id = s and type = 'subscription_payment_confirmed') like '%confirmé manuellement%', 'Confirmation manuelle : libellé clair pour l''administratrice');
  -- Double paiement détecté aussi en manuel : on n'ajoute pas un second abonnement
  perform tests.as_system();
  s := tests.mkshop(); a := tests.attempt(s); update public.subscription_payment_attempts set expires_at = now() + interval '30 seconds' where id = a; ord := tests.attempt(s);
  perform tests.verify(ord, 'confirmed', 6000, 'MPX1');
  perform tests.as_user(adm);
  e := tests.err(format('select public.admin_confirm_subscription_attempt(%L, ''REF-OM-2'')', a)); perform tests.check(e like '%déjà été activée%' and tests.n_payments(s) = 1, 'Confirmation manuelle d''un doublon : refusée, aucun second abonnement');
  perform tests.as_system();
end $$;
