-- RETOUR ARRIÈRE : après le script, fonctions, règles et déclencheurs sont identiques à la production d'origine.
do $$
declare n integer;
begin
  select count(*) into n from (
    (select sig, def from tests.baseline_defs except select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))
    union all
    (select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.oid::regprocedure::text in (select sig from tests.baseline_defs) except select sig, def from tests.baseline_defs)) x;
  perform tests.check(n = 0, 'Retour arrière : toutes les fonctions remplacées sont rétablies à l''identique de la production');
  select count(*) into n from (
    (select * from tests.baseline_policies except select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace)
    union all
    (select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace and c.relname <> 'payment_anomalies' except select * from tests.baseline_policies)) x;
  perform tests.check(n = 0, 'Retour arrière : règles d''accès (RLS) identiques à la production d''origine');
  select count(*) into n from (
    (select * from tests.baseline_triggers except select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal)
    union all (select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal except select * from tests.baseline_triggers)) x;
  perform tests.check(n = 0, 'Retour arrière : mêmes déclencheurs que la production d''origine');
  perform tests.check(not exists (select 1 from pg_proc where proname in ('order_is_unpaid', 'restock_order', 'orders_finalize_unpaid', 'payments_record_verification')), 'Retour arrière : plus aucune fonction Orange Money');
  perform tests.check(not exists (select 1 from pg_constraint where conname = 'product_variants_stock_non_negative'), 'Retour arrière : contrainte de stock retirée');
end $$;
-- Comportement Wave inchangé après retour arrière
select tests.reset();
select tests.put('wave3', to_jsonb(tests.place('wave', true)));
do $$
declare s jsonb := tests.summary(tests.getid('wave3'));
begin
  perform tests.check((s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1 and (s->>'admin_notifs')::int = 1 and (s->>'sales')::int = 2
    and (s->>'sales_commission')::int = 2600 and tests.stock() = 18, 'Retour arrière : commande Wave identique à l''état de production');
end $$;
