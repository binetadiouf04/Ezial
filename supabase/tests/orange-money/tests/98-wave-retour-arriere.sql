-- RETOUR ARRIÈRE WAVE : après le script, fonctions, droits, règles et déclencheurs sont identiques à la production d'avant Wave.
do $$
declare n integer;
begin
  select count(*) into n from (
    (select sig, def from tests.wave_baseline_defs except select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))
    union all
    (select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) except select sig, def from tests.wave_baseline_defs)) x;
  perform tests.check(n = 0, 'Retour arrière Wave : TOUTES les fonctions (public et ezial_private) identiques, texte compris, à l''état d''avant Wave');
  select count(*) into n from (
    (select * from tests.wave_baseline_acl except select p.oid::regprocedure::text, coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))
    union all
    (select p.oid::regprocedure::text, coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) except select * from tests.wave_baseline_acl)) x;
  perform tests.check(n = 0, 'Retour arrière Wave : droits d''exécution de toutes les fonctions identiques à l''état d''avant Wave');
  select count(*) into n from (
    (select * from tests.wave_baseline_policies except select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace)
    union all
    (select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace except select * from tests.wave_baseline_policies)) x;
  perform tests.check(n = 0, 'Retour arrière Wave : règles d''accès (RLS) identiques');
  select count(*) into n from (
    (select * from tests.wave_baseline_triggers except select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal)
    union all (select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal except select * from tests.wave_baseline_triggers)) x;
  perform tests.check(n = 0, 'Retour arrière Wave : mêmes déclencheurs');
  perform tests.check(to_regprocedure('public.payments_reconcile_candidates(integer,text)') is null and to_regprocedure('ezial_private.is_payment_tester(uuid,text)') is null
    and to_regprocedure('ezial_private.payment_provider_label(text)') is null, 'Retour arrière Wave : fonctions ajoutées supprimées');
  perform tests.check(not exists (select 1 from pg_constraint where conname = 'payment_testers_providers_check'), 'Retour arrière Wave : contrainte des testeurs retirée');
  perform tests.check((select count(*) from pg_proc where proname = 'payments_reconcile_candidates') = 1
    and pg_get_function_result('public.payments_reconcile_candidates(integer)'::regprocedure) like 'TABLE(transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, check_count integer)',
    'Retour arrière Wave : vérification périodique à 7 colonnes rétablie');
end $$;
-- Comportement d'avant : Wave allumé ne change plus rien
select tests.reset_wave();
update public.payment_settings set wave_enabled = true;
select tests.put('w_back', to_jsonb(tests.place('wave', true)));
do $$
declare s jsonb := tests.summary(tests.getid('w_back')); ok boolean := false;
begin
  perform tests.check(not (select payment_required from public.orders where id = tests.getid('w_back')) and (s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1
    and (s->>'sales_commission')::int = 2600 and tests.stock() = 18, 'Retour arrière Wave : commande Wave identique à l''état d''avant (notifications immédiates, commissions inchangées)');
  begin perform public.payments_create_transaction(tests.getid('w_back'), 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Retour arrière Wave : paiement Wave de nouveau piloté par collections_enabled');
  perform tests.check(public.payments_internal_secret('wave_webhook_secret') is null, 'Retour arrière Wave : le secret Wave n''est plus lisible depuis le coffre');
end $$;
