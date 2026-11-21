-- WAVE : VÉRIFICATION PÉRIODIQUE (payments_reconcile_candidates) et secrets du coffre.
select tests.reset_wave();
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('w1', to_jsonb(tests.place('wave')));
select tests.put('w2', to_jsonb(tests.place('wave')));
select tests.put('o1', to_jsonb(tests.place('orange_money')));
select tests.put('o2', to_jsonb(tests.place('orange_money')));
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions;
begin
  t := public.payments_create_transaction(tests.getid('w1'), 'wave', c);
  perform public.payments_set_pending(t.id, 'cos_w1', null, now() + interval '25 minutes'); perform tests.put('tw1', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('w2'), 'wave', c);                  -- jamais passée « en attente » : pas encore de référence
  perform tests.put('tw2', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('o1'), 'orange_money', c);
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes'); perform tests.put('to1', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('o2'), 'orange_money', c);
  perform tests.put('to2', to_jsonb(t.id));
end $$;
select tests.as_user(null, 'service_role');
do $$
declare n integer;
begin
  -- Appel SANS le nouveau paramètre (fonction Edge déjà déployée) : Orange Money seulement
  select count(*) into n from public.payments_reconcile_candidates();
  perform tests.check(n = 2 and not exists (select 1 from public.payments_reconcile_candidates() where provider <> 'orange_money'), 'Appel sans p_provider : uniquement les tentatives Orange Money');
  select count(*) into n from public.payments_reconcile_candidates(p_limit => 10);
  perform tests.check(n = 2, 'Appel nommé (p_limit seul, comme PostgREST) : sans ambiguïté, Orange Money seulement');
  perform tests.check((select count(*) from pg_proc where proname = 'payments_reconcile_candidates' and pronamespace = 'public'::regnamespace) = 1, 'Une seule signature de payments_reconcile_candidates');
  perform tests.check(not exists (select 1 from public.payments_reconcile_candidates() where reference <> transaction_id::text), 'Orange Money : référence = identifiant de la tentative (inchangé)');
  -- Wave
  select count(*) into n from public.payments_reconcile_candidates(50, 'wave');
  perform tests.check(n = 2 and not exists (select 1 from public.payments_reconcile_candidates(50, 'wave') where provider <> 'wave'), 'p_provider = ''wave'' : uniquement les tentatives Wave');
  perform tests.check((select reference from public.payments_reconcile_candidates(50, 'wave') where transaction_id = tests.getid('tw1')) = 'cos_w1', 'Wave : référence = identifiant de la session de paiement');
  perform tests.check((select reference from public.payments_reconcile_candidates(50, 'wave') where transaction_id = tests.getid('tw2')) = tests.getid('tw2')::text, 'Wave : sans session enregistrée, repli sur l''identifiant de la tentative');
  perform tests.check(pg_get_function_result('public.payments_reconcile_candidates(integer,text)'::regprocedure) = 'TABLE(transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, check_count integer, provider text)', 'Colonnes : les 7 existantes inchangées, puis provider');
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'paypal')) = 0 and (select count(*) from public.payments_reconcile_candidates(50, null)) = 0, 'Moyen inconnu ou nul : aucune ligne');
end $$;
select tests.as_system();
do $$
declare tw uuid := tests.getid('tw1');
begin
  -- Clôtures, remplacements, ancienneté, contrôle récent
  update public.payment_transactions set provider_closed_at = now() where id = tests.getid('tw2');
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'wave')) = 1, 'Wave : une tentative close chez Wave n''est plus proposée');
  update public.payment_transactions set status = 'superseded' where id = tw;
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'wave')) = 1, 'Wave : une tentative remplacée reste surveillée');
  update public.payment_transactions set last_checked_at = now() where id = tw;
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'wave')) = 0, 'Wave : contrôlée il y a moins de 45 s -> pas reproposée');
  update public.payment_transactions set last_checked_at = now() - interval '2 minutes', created_at = now() - interval '73 hours' where id = tw;
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'wave')) = 0, 'Wave : au-delà de 72 h -> plus proposée');
  update public.payment_transactions set created_at = now(), status = 'confirmed' where id = tw;
  perform tests.check((select count(*) from public.payments_reconcile_candidates(50, 'wave')) = 0, 'Wave : confirmée -> plus proposée');
end $$;
-- Droits : serveur seulement ; secrets du coffre
do $$
declare ok boolean; v text;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  ok := false; begin perform * from public.payments_reconcile_candidates(50, 'wave'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Droits : un client connecté ne peut pas appeler payments_reconcile_candidates');
  perform tests.as_user(null, 'anon');
  ok := false; begin perform * from public.payments_reconcile_candidates(); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Droits : sans connexion non plus');
  perform tests.as_system();
  perform tests.check(has_function_privilege('service_role', 'public.payments_reconcile_candidates(integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.payments_reconcile_candidates(integer, text)', 'execute')
    and not has_function_privilege('anon', 'public.payments_reconcile_candidates(integer, text)', 'execute')
    and not has_function_privilege('public', 'public.payments_reconcile_candidates(integer, text)', 'execute'), 'Droits : service_role seulement (comme avant)');
  perform tests.check(has_function_privilege('service_role', 'public.payments_record_verification(uuid, text, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.payments_record_verification(uuid, text, integer, text)', 'execute'), 'Droits : payments_record_verification toujours réservée au serveur');
  -- Coffre : trois noms autorisés, rien d'autre
  perform tests.as_user(null, 'service_role');
  perform tests.check(public.payments_internal_secret('wave_webhook_secret') = 'fictif-wave' and public.payments_internal_secret('payments_reconcile_secret') = 'fictif-reconcile'
    and public.payments_internal_secret('orange_money_callback_api_key') = 'fictif-orange', 'Coffre : les secrets Wave, vérification périodique et Orange Money sont lisibles par le serveur');
  perform tests.check(public.payments_internal_secret('autre_secret') is null, 'Coffre : tout autre nom reste refusé');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  ok := false; begin v := public.payments_internal_secret('wave_webhook_secret'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Coffre : un client ne peut pas lire le secret Wave');
  perform tests.as_system();
end $$;
