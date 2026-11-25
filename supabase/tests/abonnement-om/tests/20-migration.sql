-- MIGRATION : relançable, et rien d'autre que ce qui est annoncé ne change (commandes, paiements des commandes, commissions).
do $$
declare n integer; r record; v_changed text; v_new text;
begin
  select count(*) into n from tests.after_first a join (select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)) c using (sig) where a.h <> c.h;
  perform tests.check(n = 0, 'Idempotence : une seconde application ne change aucune fonction');
  select count(*) into n from tests.after_first a where not exists (select 1 from pg_proc p where p.oid::regprocedure::text = a.sig);
  perform tests.check(n = 0, 'Idempotence : aucune fonction supprimée par la seconde application');

  select string_agg(b.sig, ', ' order by b.sig) into v_changed from tests.base_defs b join pg_proc p on p.oid::regprocedure::text = b.sig where pg_get_functiondef(p.oid) <> b.def;
  perform tests.check(v_changed = 'admin_mark_refunded(uuid,text,text,text), notify_admin_new_subscription_payment(), process_subscription_expirations()',
    'Fonctions de production modifiées : exactement les 3 annoncées (' || coalesce(v_changed, 'aucune') || ')');
  select count(*) into n from tests.base_defs b where not exists (select 1 from pg_proc p where p.oid::regprocedure::text = b.sig);
  perform tests.check(n = 0, 'Aucune fonction de production supprimée');
  select count(*) into n from tests.base_defs b join pg_proc p on p.oid::regprocedure::text = b.sig where coalesce(p.proacl::text, '') <> b.acl;
  perform tests.check(n = 0, 'Droits d''exécution des fonctions de production inchangés');
  select string_agg(p.oid::regprocedure::text, ', ' order by 1) into v_new from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) and not exists (select 1 from tests.base_defs b where b.sig = p.oid::regprocedure::text);
  perform tests.check(v_new is not null and not exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) and not exists (select 1 from tests.base_defs b where b.sig = p.oid::regprocedure::text)
      and p.proname !~ '^(subscription_payments?_|seller_subscription_|admin_(subscription_payments|confirm_subscription_attempt|reject_subscription_attempt)|subscription_confirm_attempt|subscription_attempt_price|subscription_test_plan_available)'),
    'Fonctions ajoutées : seulement celles de l''abonnement, aucune de commande ni de paiement de commande (' || v_new || ')');

  -- Commandes et paiements des commandes : aucune colonne, aucune politique, aucun déclencheur modifié
  select count(*) into n from tests.base_columns b where b.table_name in ('orders', 'order_items', 'order_shops', 'payment_transactions', 'payment_events', 'payment_settings', 'seller_transactions', 'seller_subscriptions')
     and not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = b.table_name and c.column_name = b.column_name and c.data_type = b.data_type and coalesce(c.column_default, '') = b.dflt);
  perform tests.check(n = 0, 'Colonnes de commandes, paiements des commandes, réglages et abonnements des boutiques : inchangées');
  select count(*) into n from information_schema.columns c where c.table_schema = 'public' and c.table_name in ('orders', 'order_items', 'order_shops', 'payment_transactions', 'payment_events', 'payment_settings', 'seller_subscriptions')
     and not exists (select 1 from tests.base_columns b where b.table_name = c.table_name and b.column_name = c.column_name);
  perform tests.check(n = 0, 'Aucune colonne ajoutée à ces tables');
  perform tests.check((select count(*) from tests.base_columns b where b.table_name = 'subscription_payments') + 2 = (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'subscription_payments'), 'subscription_payments : exactement 2 colonnes ajoutées (attempt_id, source)');
  select string_agg(b.rel || '.' || b.pol, ', ') into v_changed from tests.base_policies b where not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = b.rel and p.polname = b.pol and c.relnamespace = 'public'::regnamespace);
  perform tests.check(v_changed = 'subscription_payments.subscription_payments_insert_own', 'Politiques : seule « insert_own » des abonnements est retirée (' || coalesce(v_changed, 'aucune') || ')');
  select count(*) into n from tests.base_policies b join pg_policy p on p.polname = b.pol join pg_class c on c.oid = p.polrelid and c.relname = b.rel
    where coalesce(pg_get_expr(p.polqual, p.polrelid), '') <> b.u or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') <> b.w;
  perform tests.check(n = 0, 'Politiques conservées : conditions inchangées');
  select count(*) into n from tests.base_triggers b where not exists (select 1 from pg_trigger t where t.tgname = b.tgname and t.tgrelid::regclass::text = b.rel and pg_get_triggerdef(t.oid) = b.def);
  perform tests.check(n = 0, 'Déclencheurs : tous inchangés');
  select count(*) into n from pg_trigger t where not t.tgisinternal and not exists (select 1 from tests.base_triggers b where b.tgname = t.tgname and b.rel = t.tgrelid::regclass::text);
  perform tests.check(n = 0, 'Aucun déclencheur ajouté');

  perform tests.check(not has_table_privilege('anon', 'public.subscription_payment_attempts', 'select') and not has_table_privilege('authenticated', 'public.subscription_payment_attempts', 'select')
    and not has_table_privilege('authenticated', 'public.subscription_payment_attempts', 'insert') and (select relrowsecurity from pg_class where oid = 'public.subscription_payment_attempts'::regclass),
    'Table des tentatives : RLS activée, aucun accès pour anon / authenticated');
  perform tests.check(not exists (select 1 from pg_policy where polrelid = 'public.subscription_payment_attempts'::regclass), 'Table des tentatives : aucune politique (accès uniquement par les fonctions serveur)');
  for r in select unnest(array['public.subscription_payments_create_attempt(uuid,text,text,uuid)', 'public.subscription_payments_set_pending(uuid,text,text,timestamptz)',
      'public.subscription_payments_fail(uuid,text,text)', 'public.subscription_payments_confirm(uuid,text,integer)', 'public.subscription_payments_record_verification(uuid,text,integer,text)',
      'public.subscription_payments_reconcile_candidates(integer)', 'ezial_private.subscription_confirm_attempt(uuid,text,integer,uuid)']) sig loop
    perform tests.check(not has_function_privilege('anon', r.sig, 'execute') and not has_function_privilege('authenticated', r.sig, 'execute') and has_function_privilege('service_role', r.sig, 'execute') = (r.sig not like 'ezial_private%'),
      'Droits : ' || r.sig || ' inaccessible à anon / authenticated');
  end loop;
  perform tests.check((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where proname in ('subscription_payments_create_attempt', 'subscription_payments_confirm', 'subscription_payments_record_verification', 'subscription_confirm_attempt', 'admin_confirm_subscription_attempt', 'subscription_payment_return_status', 'seller_subscription_attempt_state', 'admin_subscription_payments', 'admin_reject_subscription_attempt', 'subscription_payments_reconcile_candidates', 'subscription_payments_set_pending', 'subscription_payments_fail')),
    'Fonctions : SECURITY DEFINER avec search_path vide');
end $$;
