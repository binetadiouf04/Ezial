-- WAVE : TENTATIVES, CONFIRMATION, REMPLACEMENT, DOUBLONS, MESSAGES NEUTRES.
select tests.reset_wave();
-- Commande Wave passée AVANT l'activation : reste telle quelle
select tests.put('legacy', to_jsonb(tests.place('wave', true)));
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('wv', to_jsonb(tests.place('wave', true)));
select tests.put('om', to_jsonb(tests.place('orange_money', true)));
select tests.put('wc', to_jsonb(tests.place('wave')));     -- annulée
select tests.put('wz', to_jsonb(tests.place('wave')));     -- montant nul
select tests.put('wd', to_jsonb(tests.place('wave')));     -- délai presque écoulé
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; c2 uuid := '00000000-0000-4000-8000-0000000000c2';
  wv uuid := tests.getid('wv'); om uuid := tests.getid('om'); lg uuid := tests.getid('legacy');
  t public.payment_transactions; t2 public.payment_transactions; ok boolean; msg text;
begin
  perform tests.check(not (select payment_required from public.orders where id = lg), 'Avant activation : la commande Wave existante reste non « à payer »');
  ok := false; begin perform public.payments_create_transaction(lg, 'wave', c); exception when others then ok := sqlerrm like '%ne peut pas être payée avec Wave%'; end;
  perform tests.check(ok, 'Commande Wave d''avant l''activation : pas de paiement en ligne (message neutre « avec Wave »)');
  ok := false; begin perform public.payments_create_transaction(tests.getid('legacy'), 'orange_money', c); exception when others then ok := sqlerrm = 'Cette commande ne peut pas être payée avec Orange Money.'; end;
  perform tests.check(ok, 'Commande Wave non « à payer » payée par Orange Money : message Orange Money identique à avant');
  ok := false; begin perform public.payments_create_transaction(om, 'wave', c); exception when others then msg := sqlerrm; ok := msg = 'Cette commande doit être payée avec Orange Money.'; end;
  perform tests.check(ok, 'Commande Orange « à payer » payée par Wave : refusée, message identique à avant');
  ok := false; begin perform public.payments_create_transaction(wv, 'orange_money', c); exception when others then msg := sqlerrm; ok := msg = 'Cette commande doit être payée avec Wave.'; end;
  perform tests.check(ok, 'Commande Wave « à payer » payée par Orange Money : refusée (« doit être payée avec Wave »)');
  ok := false; begin perform public.payments_create_transaction(wv, 'paypal', c); exception when others then ok := sqlerrm like '%inconnu%'; end;
  perform tests.check(ok, 'Moyen inconnu refusé');
  ok := false; begin perform public.payments_create_transaction(wv, 'wave', c2); exception when others then ok := sqlerrm like '%introuvable%'; end;
  perform tests.check(ok, 'Création : un autre client ne peut pas payer cette commande Wave');
  update public.orders set status = 'cancelled' where id = tests.getid('wc');
  ok := false; begin perform public.payments_create_transaction(tests.getid('wc'), 'wave', c); exception when others then ok := sqlerrm like '%annulée%'; end;
  perform tests.check(ok, 'Création : commande annulée refusée');
  update public.orders set total_amount = 0 where id = tests.getid('wz');
  ok := false; begin perform public.payments_create_transaction(tests.getid('wz'), 'wave', c); exception when others then ok := sqlerrm like '%Montant de commande invalide%'; end;
  perform tests.check(ok, 'Création : montant nul refusé');
  update public.orders set payment_deadline = now() + interval '30 seconds' where id = tests.getid('wd');
  ok := false; begin perform public.payments_create_transaction(tests.getid('wd'), 'wave', c); exception when others then ok := sqlerrm like '%délai de paiement%'; end;
  perform tests.check(ok, 'Création : à moins de 60 s de la fin du délai, refusée');
  update public.payment_settings set wave_enabled = false;
  ok := false; begin perform public.payments_create_transaction(wv, 'wave', c); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Création : refusée quand l''interrupteur Wave est éteint');
  update public.payment_settings set wave_enabled = true;

  t := public.payments_create_transaction(wv, 'wave', c);
  perform tests.check(t.provider = 'wave' and t.status = 'initiated' and t.amount = tests.total(wv), 'Création : tentative Wave au montant de la commande');
  perform tests.check((public.payments_create_transaction(wv, 'wave', c)).id = t.id, 'Création : la tentative ouverte est réutilisée');
  perform public.payments_set_pending(t.id, 'cos_wave_1', 'https://pay.wave.com/c/cos_wave_1', now() + interval '25 minutes');
  update public.payment_transactions set expires_at = now() - interval '1 minute' where id = t.id;   -- session arrivée à échéance
  t2 := public.payments_create_transaction(wv, 'wave', c);
  perform tests.check(t2.id <> t.id, 'Reprise : une nouvelle tentative Wave est créée');
  perform tests.check((select status from public.payment_transactions where id = t.id) = 'superseded' and (select superseded_at from public.payment_transactions where id = t.id) is not null
    and (select provider_closed_at from public.payment_transactions where id = t.id) is null, 'Historique : l''ancienne session Wave est « remplacée » (non close, jamais annulée)');
  perform tests.check((select count(*) from public.payment_transactions where order_id = wv) = 2, 'Historique : les 2 tentatives sont conservées');
  perform tests.put('t_old', to_jsonb(t.id)); perform tests.put('t_new', to_jsonb(t2.id));
  perform tests.check((select payment_method from public.orders where id = wv) = 'wave', 'Création : moyen de paiement de la commande inchangé');

  -- Maintenance : Wave n'expire jamais sur l'horloge locale
  perform public.payments_set_pending(t2.id, 'cos_wave_2', null, now() - interval '3 hours');
  update public.payment_transactions set created_at = now() - interval '5 hours' where id = t2.id;
  perform public.payments_maintenance();
  perform tests.check((select status from public.payment_transactions where id = t2.id) = 'pending' and (select status from public.payment_transactions where id = t.id) = 'superseded',
    'Maintenance : une tentative Wave (en attente ou remplacée) n''expire jamais sur l''horloge locale');
end $$;
-- Vérifications chez Wave
do $$
declare t uuid := tests.getid('t_new'); wv uuid := tests.getid('wv'); r text;
begin
  r := public.payments_record_verification(t, 'pending'); perform tests.check(r = 'waiting', 'Vérification : « en attente » -> aucun changement');
  r := public.payments_record_verification(t, 'confirmed', null); perform tests.check(r = 'amount_missing', 'Vérification : paiement SANS montant -> refusé');
  r := public.payments_record_verification(t, 'confirmed', 100); perform tests.check(r = 'confirm:amount_mismatch', 'Vérification : montant différent -> pas de confirmation');
  perform tests.check((select payment_status from public.orders where id = wv) = 'pending' and (select count(*) from public.notifications where order_id = wv) = 0, 'Montant différent : commande en attente, aucune notification');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'amount_mismatch' and details->>'provider' = 'wave') = 1, 'Montant différent : anomalie enregistrée (fournisseur Wave)');
  r := public.payments_record_verification(t, 'confirmed', 100); perform tests.check((select count(*) from public.payment_anomalies where kind = 'amount_mismatch') = 1, 'Montant différent répété : une seule anomalie');
end $$;
-- Paiement confirmé : Wave et Orange Money, mêmes montants
do $$
declare wv uuid := tests.getid('wv'); om uuid := tests.getid('om'); tw uuid := tests.getid('t_new'); to_ public.payment_transactions; r text;
begin
  r := public.payments_record_verification(tw, 'confirmed', tests.total(wv), 'T_WAVE_1');
  perform tests.check(r = 'confirm:confirmed', 'Paiement Wave : confirmé avec le bon montant');
  -- même parcours côté Orange Money (commande équivalente)
  to_ := public.payments_create_transaction(om, 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  r := public.payments_record_verification(to_.id, 'confirmed', tests.total(om), 'MP_ORANGE_1');
  perform tests.check(r = 'confirm:confirmed', 'Paiement Orange Money équivalent : confirmé');
end $$;
-- (bloc séparé : les déclencheurs différés — WhatsApp — s'exécutent à la fin de la transaction)
do $$
declare wv uuid := tests.getid('wv'); om uuid := tests.getid('om'); tw uuid := tests.getid('t_new'); r text; n integer; sw jsonb; so jsonb; sl jsonb;
begin
  sw := tests.summary(wv); so := tests.summary(om); sl := tests.summary(tests.getid('legacy'));
  perform tests.check((select payment_status from public.orders where id = wv) = 'paid' and (select paid_processed_at from public.orders where id = wv) is not null, 'Paiement Wave : commande payée et marquée traitée');
  perform tests.check((sw->>'seller_notifs')::int = 2 and (sw->>'customer_confirmed')::int = 1 and (sw->>'admin_notifs')::int = 1 and (sw->>'events_order_confirmed')::int = 1
    and (sw->>'events_seller_created')::int = 2 and (sw->>'whatsapp')::int = 1, 'Paiement Wave : chaque vendeur, le client et l''administrateur notifiés UNE fois, événements et WhatsApp une fois');
  perform tests.check(sw = so and sw = sl, 'Paiement Wave : notifications, événements et totaux (parts, commissions, net) IDENTIQUES à Orange Money et à une commande Wave d''avant');
  perform tests.check(tests.shares(wv) = (select jsonb_agg(e) from jsonb_array_elements(tests.shares(om)) e) and tests.shares(wv) = tests.shares(tests.getid('legacy')),
    'Paiement Wave : parts vendeurs par boutique (brut, commission, net, statut) identiques à Orange Money et à l''ancien chemin Wave');
  perform tests.check((sw->>'sales_gross')::int = 30000 and (sw->>'sales_commission')::int = 2600 and (sw->>'sales_net')::int = 27400, 'Paiement Wave : 10 % + 8 % = 2 600 FCFA de commission, 27 400 de net');
  perform tests.check((select count(*) from public.seller_transactions st join public.order_shops os on os.id = st.order_shop_id
                        where st.order_id = wv and st.commission_amount = round(os.commission_amount) and st.gross_amount = round(os.subtotal)) = 2,
    'Paiement Wave : commission de chaque part = commission de la boutique dans la commande');
  perform tests.check((select provider_transaction_id from public.payment_transactions where id = tw) = 'T_WAVE_1' and (select provider_reference from public.payment_transactions where id = tw) = 'cos_wave_2',
    'Paiement Wave : identifiant de session et de transaction Wave conservés');
  for n in 1..5 loop r := public.payments_record_verification(tw, 'confirmed', tests.total(wv)); end loop;
  perform tests.check(r = 'confirm:already_confirmed' and tests.summary(wv) = sw, 'Rejeu : confirmations répétées ignorées, rien en double');
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  perform tests.check((select count(*) from public.orders where id = wv) = 1, 'Paiement Wave : le vendeur voit maintenant la commande');
  perform tests.as_system();
end $$;
-- Ancienne session payée après coup : doublon
do $$
declare told uuid := tests.getid('t_old'); wv uuid := tests.getid('wv'); r text;
begin
  r := public.payments_record_verification(told, 'confirmed', tests.total(wv));
  perform tests.check(r = 'confirm:duplicate_payment' and (select status from public.payment_transactions where id = told) = 'duplicate', 'Doublon : l''ancienne session Wave payée en plus est détectée');
  r := public.payments_record_verification(told, 'confirmed', tests.total(wv));
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'double_payment' and details->>'provider' = 'wave') = 1, 'Doublon : une seule anomalie « paiement en double » (Wave)');
  perform tests.check((select count(*) from public.payment_transactions where order_id = wv and status = 'confirmed') = 1 and (tests.summary(wv)->>'seller_notifs')::int = 2, 'Doublon : un seul paiement confirmé, aucune notification de plus');
end $$;
do $$
declare ok boolean := false;
begin
  begin perform public.payments_create_transaction(tests.getid('wv'), 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%déjà payée%'; end;
  perform tests.check(ok, 'Création : commande déjà payée refusée');
end $$;
-- Ancienne session payée AVANT la nouvelle : la commande est payée (le client a payé)
select tests.reset_wave();
update public.payment_settings set wave_enabled = true;
select tests.put('w2', to_jsonb(tests.place('wave')));
do $$
declare o uuid := tests.getid('w2'); c uuid := '00000000-0000-4000-8000-0000000000c1'; t1 public.payment_transactions; t2 public.payment_transactions; r text;
begin
  t1 := public.payments_create_transaction(o, 'wave', c);
  perform public.payments_set_pending(t1.id, 'cos_a', null, now() - interval '1 minute');
  t2 := public.payments_create_transaction(o, 'wave', c);
  r := public.payments_record_verification(t1.id, 'confirmed', tests.total(o));
  perform tests.check(r = 'confirm:confirmed' and (select payment_status from public.orders where id = o) = 'paid', 'Ancienne session Wave payée : la commande est bien payée');
  perform tests.check((select count(*) from public.notifications where order_id = o and type = 'seller_new_order') = 1, 'Ancienne session payée : vendeur notifié une seule fois');
end $$;
-- Échecs et « introuvable » : messages neutres, mêmes règles qu'Orange Money
select tests.reset_wave();
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('wf', to_jsonb(tests.place('wave')));
select tests.put('of', to_jsonb(tests.place('orange_money')));
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; tw public.payment_transactions; to_ public.payment_transactions; r text;
begin
  tw := public.payments_create_transaction(tests.getid('wf'), 'wave', c);
  to_ := public.payments_create_transaction(tests.getid('of'), 'orange_money', c);
  perform public.payments_set_pending(tw.id, 'cos_f', null, now() + interval '20 minutes');
  perform public.payments_set_pending(to_.id, to_.id::text, null, now() + interval '20 minutes');
  r := public.payments_record_verification(tw.id, 'not_found');
  perform tests.check(r = 'waiting' and (select provider_closed_at from public.payment_transactions where id = tw.id) is null, 'Wave « introuvable » avant la fin de validité : pas de clôture');
  update public.payment_transactions set expires_at = now() - interval '4 minutes' where id in (tw.id, to_.id);
  perform tests.check(public.payments_record_verification(tw.id, 'not_found') = 'waiting' and public.payments_record_verification(to_.id, 'not_found') = 'waiting', '« Introuvable » moins de 5 min après la fin de validité : toujours pas de clôture (Wave et Orange)');
  update public.payment_transactions set expires_at = now() - interval '10 minutes' where id in (tw.id, to_.id);
  r := public.payments_record_verification(tw.id, 'not_found');
  perform tests.check(r = 'closed:expired' and (select failure_reason from public.payment_transactions where id = tw.id) = 'Aucune transaction Wave après la fin de validité de la session de paiement', 'Wave « introuvable » après validité + 5 min : close, motif neutre');
  r := public.payments_record_verification(to_.id, 'not_found');
  perform tests.check(r = 'closed:expired' and (select failure_reason from public.payment_transactions where id = to_.id) = 'Aucune transaction Orange Money après la fin de validité du QR', 'Orange « introuvable » : motif IDENTIQUE à avant');
end $$;
select tests.reset_wave();
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('wf', to_jsonb(tests.place('wave')));
select tests.put('of', to_jsonb(tests.place('orange_money')));
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; tw public.payment_transactions; to_ public.payment_transactions; r text;
begin
  tw := public.payments_create_transaction(tests.getid('wf'), 'wave', c);
  to_ := public.payments_create_transaction(tests.getid('of'), 'orange_money', c);
  r := public.payments_record_verification(tw.id, 'failed');
  perform tests.check(r = 'fail:failed' and (select failure_reason from public.payment_transactions where id = tw.id) = 'Statut Wave : failed' and (select provider_closed_at from public.payment_transactions where id = tw.id) is not null,
    'Wave « échec » : tentative close, motif « Statut Wave : failed »');
  r := public.payments_record_verification(to_.id, 'expired');
  perform tests.check(r = 'fail:expired' and (select failure_reason from public.payment_transactions where id = to_.id) = 'Statut Orange Money : expired', 'Orange « expiré » : motif IDENTIQUE à avant');
  perform tests.check(public.payments_record_verification(tw.id, 'confirmed', 1) is not null, 'Vérification d''une tentative déjà close : aucune erreur');
end $$;
