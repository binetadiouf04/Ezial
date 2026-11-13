-- Retour arrière de docs/sql/seo-frequence-6h.sql : la vérification repasse
-- à toutes les heures (état d'origine). La tâche de nuit n'est pas touchée.
select cron.schedule('seo-rebuild-hourly', '7 * * * *', 'select ezial_private.request_seo_rebuild(false);');

select 'vérification toutes les heures (état d''origine)' as element,
       case when exists (select 1 from cron.job where jobname = 'seo-rebuild-hourly' and schedule = '7 * * * *' and active) then 'ok' else 'À VÉRIFIER' end as etat;
