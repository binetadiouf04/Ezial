-- ADMINISTRATION, DROITS D'ACCÈS ET CONFIDENTIALITÉ.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('o1', to_jsonb(tests.place('orange_money', false)));
do $$
declare o uuid := tests.getid('o1'); t public.payment_transactions;
begin
  t := public.payments_create_transaction(o, 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '20 minutes');
  perform public.payments_record_verification(t.id, 'confirmed', 100);   -- anomalie « montant différent »
  update public.payment_transactions set expires_at = now() - interval '1 minute' where id = t.id;
  perform public.payments_create_transaction(o, 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  perform tests.put('tx', to_jsonb(t.id));
end $$;
do $$
declare ok boolean; n integer; a public.payment_anomalies; aid uuid;
begin
  -- non-administrateurs : refusés
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  ok := false; begin perform * from public.admin_payment_attempts(); exception when others then ok := true; end; perform tests.check(ok, 'Admin : un vendeur ne peut pas lister les tentatives');
  ok := false; begin perform * from public.admin_payment_anomalies(); exception when others then ok := true; end; perform tests.check(ok, 'Admin : un vendeur ne peut pas lister les anomalies');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  ok := false; begin perform public.admin_update_payment_anomaly(gen_random_uuid(), 'resolved'); exception when others then ok := true; end; perform tests.check(ok, 'Admin : un client ne peut pas modifier une anomalie');
  select count(*) into n from public.payment_transactions; perform tests.check(n = 2, 'Client : voit ses propres tentatives de paiement (suivi du paiement)');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c2');
  select count(*) into n from public.payment_transactions; perform tests.check(n = 0, 'Client : ne voit pas les tentatives d''un autre client');
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.payment_transactions; perform tests.check(n = 0, 'Vendeur : ne voit aucune tentative de paiement');
  select count(*) into n from public.payment_anomalies; perform tests.check(n = 0, 'Vendeur : ne voit aucune anomalie');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  select count(*) into n from public.payment_anomalies; perform tests.check(n = 0, 'Client : ne voit aucune anomalie');
  ok := false; begin insert into public.payment_anomalies (kind) values ('double_payment'); exception when others then ok := true; end; perform tests.check(ok, 'Client : ne peut pas créer d''anomalie');
  ok := false; begin update public.payment_transactions set status = 'confirmed'; get diagnostics n = row_count; if n > 0 then ok := false; else ok := true; end if; exception when others then ok := true; end;
  perform tests.check(ok, 'Client : ne peut pas marquer un paiement comme confirmé');
  -- administrateur
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.admin_payment_attempts(array['pending', 'superseded', 'initiated', 'failed']);
  perform tests.check(n = 2, 'Admin : voit les tentatives en attente / remplacées / échouées');
  select count(*) into n from public.admin_payment_attempts(array['failed']); perform tests.check(n = 0, 'Admin : le filtre par statut fonctionne');
  select id into aid from public.admin_payment_anomalies('open') limit 1; perform tests.check(aid is not null, 'Admin : voit les anomalies ouvertes');
  ok := false; begin perform public.admin_update_payment_anomaly(aid, 'nimporte'); exception when others then ok := true; end; perform tests.check(ok, 'Admin : statut d''anomalie invalide refusé');
  a := public.admin_update_payment_anomaly(aid, 'refund_pending', 'Remboursement demandé à Orange');
  perform tests.check(a.status = 'refund_pending' and a.resolved_at is null, 'Admin : anomalie « remboursement en cours »');
  a := public.admin_update_payment_anomaly(aid, 'refunded', 'Remboursé chez Orange, vérifié');
  perform tests.check(a.status = 'refunded' and a.resolved_at is not null and a.resolved_by = '00000000-0000-4000-8000-0000000000a1', 'Admin : anomalie « remboursée » avec date et auteur');
  perform tests.as_system();
  perform tests.check((select count(*) from public.finance_audit_log where action like 'payment_anomaly_%') = 2, 'Admin : chaque traitement d''anomalie est journalisé');
end $$;
-- Droits d'exécution des fonctions sensibles
do $$
begin
  perform tests.check(not has_function_privilege('anon', 'public.payments_record_verification(uuid,text,integer,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.payments_record_verification(uuid,text,integer,text)', 'execute')
    and has_function_privilege('service_role', 'public.payments_record_verification(uuid,text,integer,text)', 'execute'), 'Droits : la vérification de paiement est réservée au serveur');
  perform tests.check(not has_function_privilege('anon', 'public.payments_reconcile_candidates(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.payments_reconcile_candidates(integer)', 'execute'), 'Droits : la liste des paiements à vérifier est réservée au serveur');
  perform tests.check(not has_function_privilege('authenticated', 'public.payments_confirm(uuid,text,integer)', 'execute')
    and not has_function_privilege('anon', 'public.payments_fail(uuid,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.payments_create_transaction(uuid,text,uuid)', 'execute'), 'Droits : confirmer / échouer / créer un paiement reste réservé au serveur');
  perform tests.check(not has_function_privilege('authenticated', 'ezial_private.restock_order(uuid)', 'execute')
    and not has_function_privilege('anon', 'ezial_private.orders_finalize_unpaid()', 'execute'), 'Droits : restitution de stock et annulation automatiques non appelables par les utilisateurs');
  perform tests.check(not has_function_privilege('anon', 'public.admin_payment_attempts(text[],integer)', 'execute'), 'Droits : fonctions admin refusées aux visiteurs anonymes');
  perform tests.check(not has_function_privilege('anon', 'public.order_is_unpaid(uuid)', 'execute'), 'Droits : l''aide RLS n''est pas exposée aux visiteurs anonymes');
end $$;
