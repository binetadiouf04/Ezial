-- Retour arrière : l'état de production est rétabli à l'identique (fonctions, droits, déclencheurs, politiques).
do $$
declare v_fn integer; v_acl integer; v_trg integer; v_pol integer; v_rows integer;
begin
  select count(*) into v_fn from (
    (select sig, def from tests.base_defs except select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))
    union all
    (select p.oid::regprocedure::text, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace) except select sig, def from tests.base_defs)) x;
  perform tests.check(v_fn = 0, 'retour arrière : toutes les fonctions (texte) identiques à la production, aucune fonction en plus ni en moins');
  select count(*) into v_acl from (
    (select sig, acl from tests.base_defs except select p.oid::regprocedure::text, coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace))) x;
  perform tests.check(v_acl = 0, 'retour arrière : droits d''exécution identiques à la production');
  select count(*) into v_trg from (
    (select tgname, rel, def from tests.base_triggers except select tgname::text, tgrelid::regclass::text, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal)
    union all (select tgname::text, tgrelid::regclass::text, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal except select tgname, rel, def from tests.base_triggers)) x;
  perform tests.check(v_trg = 0, 'retour arrière : déclencheurs identiques à la production');
  select count(*) into v_pol from (
    (select rel, pol, cmd, u, w from tests.base_policies except select c.relname::text, p.polname::text, p.polcmd::text, coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace)) x;
  perform tests.check(v_pol = 0 and not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname not in (select rel from tests.base_policies) and c.relname <> 'order_shop_cancellations' and c.relnamespace = 'public'::regnamespace),
    'retour arrière : politiques RLS identiques à la production');
  perform tests.check(to_regprocedure('public.seller_cancel_order_shop(uuid,text,text)') is null and to_regprocedure('public.admin_refunds_to_make(text)') is null
    and to_regprocedure('public.admin_mark_refunded(uuid,text,text,text)') is null and to_regprocedure('public.admin_shop_cancellation_stats()') is null
    and to_regprocedure('ezial_private.ensure_delivery_mission(uuid)') is null and to_regclass('ezial_private.vendeur_annulation_saved_functions') is null, 'retour arrière : fonctions ajoutées supprimées');
  select count(*) into v_rows from public.order_shop_cancellations;
  perform tests.check(v_rows >= 1, 'retour arrière : table d''historique CONSERVÉE (' || v_rows || ' ligne(s)) tant qu''elle contient des annulations réelles');
  -- Les données de commandes ne sont jamais touchées
  perform tests.check(exists (select 1 from public.order_shops where status = 'cancelled'), 'retour arrière : les parts annulées restent annulées (aucune donnée de commande supprimée)');
  -- Sans la fonction, un vendeur ne peut plus annuler (retour au comportement d'avant)
  perform tests.check(tests.err(format('select public.seller_cancel_order_shop(%L, ''other'', null)', gen_random_uuid())) like '%does not exist%', 'retour arrière : la fonction n''existe plus (le site masque le bouton : erreur PGRST202)');
  -- Mission : l'ancien déclencheur de production fonctionne de nouveau
  perform tests.reset_a();
  perform tests.put('o', to_jsonb(tests.mk_unpaid('12')));
  perform tests.ready('1', tests.getid('o')); perform tests.ready('2', tests.getid('o'));
  perform tests.check(tests.stops(tests.getid('o')) = 2, 'retour arrière : mission à 2 arrêts créée par la fonction de production d''origine');
end $$;
