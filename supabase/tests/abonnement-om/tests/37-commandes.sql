-- NON-RÉGRESSION : les commandes clients et leurs paiements fonctionnent exactement comme avant, indépendamment des abonnements.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('om', to_jsonb(tests.place('orange_money', true)));
do $$
declare o uuid := tests.getid('om'); c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions; r text; s jsonb; sa uuid; n integer; ret record; cand integer;
begin
  t := public.payments_create_transaction(o, 'orange_money', c);
  perform tests.check(t.status = 'initiated' and t.amount = tests.total(o), 'Commande : tentative de paiement créée avec le total de la commande');
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes');
  -- Une tentative d'ABONNEMENT en attente ne se mélange pas aux tentatives de commande
  sa := tests.attempt(tests.mkshop());
  select count(*) into cand from public.payments_reconcile_candidates(100) where transaction_id = sa; perform tests.check(cand = 0, 'Rapprochement des commandes : n''inclut jamais une tentative d''abonnement');
  select count(*) into cand from public.subscription_payments_reconcile_candidates(100) where transaction_id = t.id; perform tests.check(cand = 0, 'Rapprochement des abonnements : n''inclut jamais une tentative de commande');
  perform tests.check(public.payments_record_verification(sa, 'confirmed', 6000, 'X') = 'not_found', 'Une tentative d''abonnement n''est pas une transaction de commande (« not_found »)');
  perform tests.check(public.subscription_payments_record_verification(t.id, 'confirmed', t.amount, 'X') = 'not_found', 'Une transaction de commande n''est pas une tentative d''abonnement (« not_found »)');
  r := public.payments_record_verification(t.id, 'confirmed', t.amount, 'MP-CMD-1');
  perform tests.check(r = 'confirm:confirmed', 'Commande : paiement Orange confirmé comme avant');
  perform tests.check((select payment_status from public.orders where id = o) = 'paid', 'Commande : « payée »');
  s := tests.summary(o);
  perform tests.check((s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1, 'Commande : vendeurs et client notifiés comme avant');
  perform tests.check((s->>'sales_gross')::int = 30000 and (s->>'sales_commission')::int = 2600 and (s->>'sales_net')::int = 27400, 'Commande : commissions identiques (10 % / 8 %, 30 000 FCFA bruts)');
  select * into ret from public.payment_return_status(t.id); perform tests.check(ret.payment_state = 'paid', 'Commande : page de retour des commandes inchangée (« paid »)');
  perform tests.check(public.payments_record_verification(t.id, 'confirmed', t.amount, 'MP-CMD-1') = 'confirm:already_confirmed', 'Commande : confirmation rejouée sans effet');
  perform tests.check(not exists (select 1 from public.payment_anomalies where subscription_attempt_id is not null), 'Aucune anomalie d''abonnement créée par une commande');
  perform tests.check(tests.n_payments('00000000-0000-4000-8000-0000000000b1') = 0, 'Aucun paiement d''abonnement créé par une commande');
end $$;
-- Maintenance des commandes : n'expire jamais une tentative d'abonnement Orange
do $$
declare sa uuid := tests.attempt(tests.mkshop()); w uuid;
begin
  update public.subscription_payment_attempts set created_at = now() - interval '5 hours', expires_at = now() - interval '4 hours' where id = sa;
  perform public.payments_maintenance();
  perform tests.check((select status from public.subscription_payment_attempts where id = sa) = 'pending', 'Maintenance des commandes : ne touche pas aux tentatives d''abonnement (Orange les clôt seulement après vérification)');
end $$;
