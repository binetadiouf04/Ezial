-- APRÈS LES RETOURS ARRIÈRE 3, 2, 1 : la base est EXACTEMENT revenue à l'état de production.
do $$
declare n integer;
begin
  select count(*) into n from (
    (select sig, def, acl from tests.base_defs except
     select p.oid::regprocedure::text, pg_get_functiondef(p.oid), coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))
    union all
    (select p.oid::regprocedure::text, pg_get_functiondef(p.oid), coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)
     except select sig, def, acl from tests.base_defs)) x;
  perform tests.check(n = 0, 'Retour arrière : fonctions et droits d''exécution identiques à la production (texte exact)');
  perform tests.check(md5(pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) = '10178f6554882cf5390eb6f0a7a13381', 'Retour arrière : create_order = empreinte de production (avec livraison urgente)');
  perform tests.check(md5(pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure)) = '0b3d5a31187d24b38dc0e1f88d809e10', 'Retour arrière : trg_orders_on_paid = empreinte de production');
  perform tests.check(md5(pg_get_functiondef('public.validate_promo_code(text,integer)'::regprocedure)) = 'e201da3dc59f4e72e8b74073bcdf670d', 'Retour arrière : validate_promo_code = empreinte de production');
  select count(*) into n from ((select * from tests.base_policies except select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace)
    union all (select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace except select * from tests.base_policies)) x;
  perform tests.check(n = 0, 'Retour arrière : règles d''accès identiques');
  select count(*) into n from ((select * from tests.base_triggers except select tgname::text, tgrelid::regclass::text, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal)
    union all (select tgname::text, tgrelid::regclass::text, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal except select * from tests.base_triggers)) x;
  perform tests.check(n = 0, 'Retour arrière : déclencheurs identiques');
  select count(*) into n from ((select * from tests.base_columns except select table_name::text, column_name::text, data_type::text, coalesce(column_default, '') from information_schema.columns where table_schema = 'public')
    union all (select table_name::text, column_name::text, data_type::text, coalesce(column_default, '') from information_schema.columns where table_schema = 'public' except select * from tests.base_columns)) x;
  perform tests.check(n = 0, 'Retour arrière : colonnes identiques (orders, order_shops…)');
  select count(*) into n from ((select * from tests.base_tables except select tablename::text from pg_tables where schemaname in ('public', 'ezial_private'))
    union all (select tablename::text from pg_tables where schemaname in ('public', 'ezial_private') except select * from tests.base_tables)) x;
  perform tests.check(n = 0, 'Retour arrière : tables identiques (aucune table de campagne restante)');
  perform tests.check((select count(*) from public.promo_codes where code = 'EZI10') = 1, 'Retour arrière : promo_codes (EZI10) intacte');
end $$;
-- Non-régression après retour arrière : mêmes commandes, mêmes montants qu'en production
select tests.check(tests.reference_scenario() = (select v from tests.reference), 'Retour arrière : commandes sans promotion identiques à la référence de production');
