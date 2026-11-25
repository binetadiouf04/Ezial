-- RETOUR ARRIÈRE : l'état de production d'avant la migration est rétabli à l'identique.
do $$
declare n integer; v text;
begin
  select count(*) into n from tests.base_defs b where not exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) and p.oid::regprocedure::text = b.sig and pg_get_functiondef(p.oid) = b.def);
  perform tests.check(n = 0, 'Retour arrière : toutes les fonctions de production sont identiques à l''original (texte exact)');
  select count(*) into n from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) and not exists (select 1 from tests.base_defs b where b.sig = p.oid::regprocedure::text);
  perform tests.check(n = 0, 'Retour arrière : aucune fonction ajoutée ne subsiste');
  select count(*) into n from tests.base_defs b join pg_proc p on p.oid::regprocedure::text = b.sig where coalesce(p.proacl::text, '') <> b.acl;
  perform tests.check(n = 0, 'Retour arrière : droits d''exécution d''origine');
  perform tests.check(to_regclass('public.subscription_payment_attempts') is null and to_regclass('ezial_private.abonnement_om_saved_functions') is null, 'Retour arrière : table des tentatives et copie de sauvegarde supprimées');
  select count(*) into n from tests.base_columns b where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = b.table_name and c.column_name = b.column_name);
  perform tests.check(n = 0, 'Retour arrière : aucune colonne d''origine perdue');
  select count(*) into n from information_schema.columns c where c.table_schema = 'public' and not exists (select 1 from tests.base_columns b where b.table_name = c.table_name and b.column_name = c.column_name);
  perform tests.check(n = 0, 'Retour arrière : colonnes ajoutées retirées');
  select count(*) into n from tests.base_policies b where not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = b.rel and p.polname = b.pol and c.relnamespace = 'public'::regnamespace
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '') = b.u and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = b.w);
  perform tests.check(n = 0, 'Retour arrière : politiques d''origine rétablies à l''identique (dont « insert_own »)');
  select count(*) into n from tests.base_triggers b where not exists (select 1 from pg_trigger t where t.tgname = b.tgname and t.tgrelid::regclass::text = b.rel and pg_get_triggerdef(t.oid) = b.def);
  perform tests.check(n = 0, 'Retour arrière : déclencheurs identiques');
  perform tests.check(pg_get_constraintdef((select oid from pg_constraint where conname = 'order_shop_cancellations_refund_method_check')) like '%especes%', 'Retour arrière : contrainte des remboursements d''origine rétablie');
  perform tests.check(not exists (select 1 from pg_constraint where conname = 'subscription_payments_source_check'), 'Retour arrière : contrainte « source » retirée');
end $$;
