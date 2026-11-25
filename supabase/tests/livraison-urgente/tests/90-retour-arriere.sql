-- RETOUR ARRIÈRE : deux cas (commandes urgentes présentes / absentes), puis réapplication.
\set QUIET on
\i ../../../docs/sql/lancement-livraison-urgente-retour-arriere.sql
do $$ begin
  perform tests.check((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.create_order(jsonb)'::regprocedure) = '147fe41987848a9c884cbb129ae0bcca',
    'Retour arrière : create_order identique à la production du 24 nov. 2026');
  perform tests.check(to_regclass('public.urgent_delivery_settings') is null and to_regprocedure('public.get_urgent_delivery_options()') is null
    and to_regprocedure('ezial_private.order_urgent_fee(jsonb, boolean)') is null, 'Retour arrière : réglages et fonctions supprimés');
  perform tests.check((select count(*) from information_schema.columns where table_name = 'orders' and column_name in ('is_urgent', 'urgent_fee')) = 2
    and exists (select 1 from public.orders where is_urgent), 'Retour arrière avec commandes urgentes : colonnes conservées (aucune donnée perdue)');
end $$;
select tests.reset_wave();
do $$ declare o public.orders; begin
  o := tests.scenario('A_une_boutique');
  perform tests.check(o.total_amount = (select total from tests.ref where scenario = 'A_une_boutique'), 'Retour arrière : une commande normale fonctionne comme avant');
end $$;
\i ../../../docs/sql/lancement-livraison-urgente.sql
\i ../../../docs/sql/lancement-livraison-urgente-retour-arriere.sql
do $$ begin
  perform tests.check((select count(*) from information_schema.columns where table_name = 'orders' and column_name in ('is_urgent', 'urgent_fee')) = 0,
    'Retour arrière sans commande urgente : colonnes supprimées');
end $$;
\i ../../../docs/sql/lancement-livraison-urgente.sql
do $$ begin
  perform tests.check(ezial_private.urgent_delivery_fee() = 500 and (select prosrc from pg_proc where oid = 'public.create_order(jsonb)'::regprocedure) like '%order_urgent_fee%',
    'Réapplication après retour arrière : migration de nouveau en place');
end $$;
