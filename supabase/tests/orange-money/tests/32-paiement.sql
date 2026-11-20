-- TENTATIVES DE PAIEMENT, CONFIRMATION, REMPLACEMENT, DOUBLONS.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('om', to_jsonb(tests.place('orange_money', true)));
select tests.put('wave_ref', to_jsonb(tests.place('wave', true)));
do $$
declare o uuid := tests.getid('om'); w uuid := tests.getid('wave_ref'); c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions; t2 public.payment_transactions; ok boolean;
begin
  ok := false; begin perform public.payments_create_transaction(w, 'orange_money', c); exception when others then ok := true; end;
  perform tests.check(ok, 'Création : une commande Wave ne peut pas être payée par Orange Money');
  ok := false; begin perform public.payments_create_transaction(o, 'wave', c); exception when others then ok := true; end;
  perform tests.check(ok, 'Création : une commande Orange Money ne peut pas être payée par Wave');
  ok := false; begin perform public.payments_create_transaction(o, 'orange_money', '00000000-0000-4000-8000-0000000000c2'); exception when others then ok := true; end;
  perform tests.check(ok, 'Création : un autre client ne peut pas payer cette commande');
  update public.payment_settings set orange_money_enabled = false;
  ok := false; begin perform public.payments_create_transaction(o, 'orange_money', c); exception when others then ok := true; end;
  perform tests.check(ok, 'Création : refusée quand l''interrupteur Orange Money est éteint');
  update public.payment_settings set orange_money_enabled = true;

  t := public.payments_create_transaction(o, 'orange_money', c);
  perform tests.check(t.status = 'initiated' and t.amount = tests.total(o), 'Création : tentative créée avec le montant de la commande (produits + livraison)');
  perform tests.check((public.payments_create_transaction(o, 'orange_money', c)).id = t.id, 'Création : la tentative ouverte est réutilisée (pas de doublon)');
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes');
  update public.payment_transactions set status = 'pending', expires_at = now() - interval '1 minute' where id = t.id;   -- ancien QR arrivé à échéance
  t2 := public.payments_create_transaction(o, 'orange_money', c);
  perform tests.check(t2.id <> t.id, 'Reprise : un nouveau QR est créé pendant la fenêtre');
  perform tests.check((select status from public.payment_transactions where id = t.id) = 'superseded' and (select superseded_at from public.payment_transactions where id = t.id) is not null,
    'Historique : l''ancien QR est conservé « remplacé » (jamais supprimé ni annulé)');
  perform tests.check((select count(*) from public.payment_transactions where order_id = o) = 2, 'Historique : les 2 tentatives existent');
  perform tests.put('t_old', to_jsonb(t.id)); perform tests.put('t_new', to_jsonb(t2.id));

  -- Orange n'a encore rien reçu : l'ancien QR n'est pas clos tant qu'Orange ne l'a pas dit
  perform public.payments_maintenance();
  perform tests.check((select status from public.payment_transactions where id = t.id) = 'superseded' and (select provider_closed_at from public.payment_transactions where id = t.id) is null,
    'Maintenance locale : une tentative Orange n''expire jamais sur l''horloge locale');
end $$;
-- Statut « en attente » chez Orange : rien ne change
do $$
declare t uuid := tests.getid('t_new'); r text;
begin
  r := public.payments_record_verification(t, 'pending'); perform tests.check(r = 'waiting', 'Vérification : « en attente » chez Orange -> aucun changement');
  r := public.payments_record_verification(t, 'unknown'); perform tests.check(r = 'waiting', 'Vérification : statut inconnu -> aucun changement');
  perform tests.check((select check_count from public.payment_transactions where id = t) = 2, 'Vérification : le nombre de contrôles est enregistré');
  r := public.payments_record_verification(t, 'confirmed', null); perform tests.check(r = 'amount_missing', 'Vérification : paiement confirmé SANS montant -> refusé (jamais de confirmation à l''aveugle)');
  r := public.payments_record_verification(t, 'confirmed', 100); perform tests.check(r = 'confirm:amount_mismatch', 'Vérification : montant différent -> pas de confirmation');
  perform tests.check((select payment_status from public.orders where id = tests.getid('om')) = 'pending', 'Montant différent : la commande reste en attente');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'amount_mismatch') = 1, 'Montant différent : anomalie enregistrée');
  r := public.payments_record_verification(t, 'confirmed', 100); perform tests.check((select count(*) from public.payment_anomalies where kind = 'amount_mismatch') = 1, 'Montant différent répété : une seule anomalie');
  perform tests.check((select count(*) from public.notifications where order_id = tests.getid('om')) = 0, 'Montant différent : toujours aucune notification');
end $$;
-- Paiement confirmé
do $$
declare t uuid := tests.getid('t_new'); r text;
begin
  r := public.payments_record_verification(t, 'confirmed', tests.total(tests.getid('om')), 'MP220928.1029.C58502');
  perform tests.check(r = 'confirm:confirmed', 'Paiement : confirmé par Orange avec le bon montant');
end $$;
do $$
declare o uuid := tests.getid('om'); s jsonb := tests.summary(tests.getid('om')); w jsonb := tests.summary(tests.getid('wave_ref')); r text; n integer;
begin
  perform tests.check((select payment_status from public.orders where id = o) = 'paid' and (select paid_processed_at from public.orders where id = o) is not null, 'Paiement : commande payée et marquée traitée');
  perform tests.check((s->>'seller_notifs')::int = 2, 'Paiement : chaque vendeur est notifié UNE fois, après paiement (2 boutiques)');
  perform tests.check((s->>'customer_confirmed')::int = 1 and (s->>'admin_notifs')::int = 1, 'Paiement : client et administrateur notifiés une fois');
  perform tests.check((s->>'events_order_confirmed')::int = 1 and (s->>'events_seller_created')::int = 2, 'Paiement : événements émis une fois');
  perform tests.check((s->>'whatsapp')::int = 1, 'Paiement : WhatsApp seulement après paiement (une fois)');
  perform tests.check((s->>'sales')::int = 2 and (s->>'sales_gross') = (w->>'sales_gross') and (s->>'sales_commission') = (w->>'sales_commission') and (s->>'sales_net') = (w->>'sales_net'),
    'Paiement : parts vendeurs et commissions IDENTIQUES à une commande Wave équivalente');
  perform tests.check((select count(*) from public.seller_transactions where order_id = o and status = 'pending') = 2, 'Paiement : parts « en attente » jusqu''à livraison (règle inchangée)');
  perform tests.check((select provider_transaction_id from public.payment_transactions where id = tests.getid('t_new')) = 'MP220928.1029.C58502', 'Paiement : identifiant de transaction Orange conservé');
  -- Rejeux : notification répétée, vérification répétée, mauvais ordre
  for n in 1..5 loop r := public.payments_record_verification(tests.getid('t_new'), 'confirmed', tests.total(tests.getid('om'))); end loop;
  perform tests.check(r = 'confirm:already_confirmed', 'Rejeu : confirmation répétée ignorée');
  s := tests.summary(o);
  perform tests.check((s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1 and (s->>'admin_notifs')::int = 1 and (s->>'sales')::int = 2 and (s->>'whatsapp')::int = 1,
    'Rejeu : aucune notification ni part vendeur en double');
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  perform tests.check((select count(*) from public.orders where id = o) = 1, 'Paiement : le vendeur voit maintenant la commande');
  update public.order_shops set status = 'ready' where order_id = o and shop_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count; perform tests.check(n = 1, 'Paiement : le vendeur peut maintenant préparer la commande');
  perform tests.as_system();
end $$;
-- Ancien QR payé après coup : doublon, jamais deux paiements pris en compte
do $$
declare told uuid := tests.getid('t_old'); r text;
begin
  r := public.payments_record_verification(told, 'confirmed', tests.total(tests.getid('om')));
  perform tests.check(r = 'confirm:duplicate_payment', 'Doublon : l''ancien QR payé en plus est détecté');
  perform tests.check((select status from public.payment_transactions where id = told) = 'duplicate', 'Doublon : tentative marquée « duplicate », historique conservé');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'double_payment') = 1, 'Doublon : anomalie enregistrée pour remboursement manuel');
  r := public.payments_record_verification(told, 'confirmed', tests.total(tests.getid('om'))); r := public.payments_record_verification(told, 'confirmed', tests.total(tests.getid('om')));
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'double_payment') = 1, 'Doublon répété : une seule anomalie');
  perform tests.check((select count(*) from public.payment_transactions where order_id = tests.getid('om') and status = 'confirmed') = 1, 'Doublon : un seul paiement confirmé par commande');
  perform tests.check((tests.summary(tests.getid('om'))->>'seller_notifs')::int = 2, 'Doublon : aucune notification supplémentaire');
end $$;
-- Un ancien QR (remplacé) payé AVANT le nouveau : la commande est payée
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('om', to_jsonb(tests.place('orange_money', false)));
do $$
declare o uuid := tests.getid('om'); c uuid := '00000000-0000-4000-8000-0000000000c1'; t1 public.payment_transactions; t2 public.payment_transactions; r text;
begin
  t1 := public.payments_create_transaction(o, 'orange_money', c);
  perform public.payments_set_pending(t1.id, t1.id::text, null, now() - interval '1 minute');
  t2 := public.payments_create_transaction(o, 'orange_money', c);
  perform tests.check((select status from public.payment_transactions where id = t1.id) = 'superseded', 'Ancien QR : conservé');
  r := public.payments_record_verification(t1.id, 'confirmed', tests.total(o));
  perform tests.check(r = 'confirm:confirmed' and (select payment_status from public.orders where id = o) = 'paid', 'Ancien QR payé : la commande est bien payée (c''est le client qui a payé)');
  perform tests.check((select count(*) from public.notifications where order_id = o and type = 'seller_new_order') = 1, 'Ancien QR payé : vendeur notifié une seule fois');
  -- Délai dépassé : plus de nouveau QR
  update public.orders set payment_status = 'pending', paid_processed_at = null where id = o;
end $$;
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('om', to_jsonb(tests.place('orange_money', false)));
do $$
declare ok boolean := false;
begin
  update public.orders set payment_deadline = now() + interval '30 seconds' where id = tests.getid('om');
  begin perform public.payments_create_transaction(tests.getid('om'), 'orange_money', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := true; end;
  perform tests.check(ok, 'Fenêtre : plus de nouveau QR à moins d''une minute de la fin du délai (jamais un QR plus long que la fenêtre)');
end $$;
