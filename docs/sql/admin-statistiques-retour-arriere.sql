-- Retour arrière de docs/sql/admin-statistiques.sql : retire la fonction de
-- statistiques et l'index. Aucune donnée supprimée. Le tableau de bord
-- administrateur revient alors à son affichage simple (compteurs et
-- commandes récentes), sans erreur.
begin;
drop function if exists public.admin_sales_stats(timestamptz, timestamptz);
drop index if exists public.orders_created_at_idx;
commit;

select 'statistiques administrateur retirées' as element,
       case when to_regprocedure('public.admin_sales_stats(timestamptz, timestamptz)') is null then 'ok' else 'À VÉRIFIER' end as etat;
