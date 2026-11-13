-- Régénération des pages statiques (Google, aperçus de partage) : passage de
-- la vérification « toutes les heures » à « toutes les 6 heures ».
--
-- NE PAS EXÉCUTER sans décision : ce script modifie une tâche active.
--
-- Avant : seo-rebuild-hourly  à chaque heure + 7 min  (24 vérifications par jour)
--         seo-rebuild-nightly à 03:17 UTC, reconstruction forcée
-- Après : seo-rebuild-hourly  à 09:07, 15:07 et 21:07 UTC (ne reconstruit que
--         si le catalogue a changé)
--         seo-rebuild-nightly à 03:17 UTC, inchangée
-- Soit une occasion de reconstruction toutes les 6 heures, sans doublon : la
-- tâche de nuit occupe le créneau de 03 h, la tâche conditionnelle les trois
-- autres. Au plus 4 reconstructions par jour (120 par mois, pour 500 offertes
-- par Cloudflare Pages).
--
-- Le nom « seo-rebuild-hourly » et la commande sont conservés à l'identique :
-- seule la fréquence change. Heure de Dakar = UTC.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'seo-rebuild-hourly'
                 and command = 'select ezial_private.request_seo_rebuild(false);') then
    raise exception 'Tâche seo-rebuild-hourly absente ou différente de celle attendue : rien n''est modifié.';
  end if;
  if not exists (select 1 from cron.job where jobname = 'seo-rebuild-nightly' and schedule = '17 3 * * *' and active) then
    raise exception 'Tâche seo-rebuild-nightly absente, inactive ou déplacée : rien n''est modifié.';
  end if;
end $$;

select cron.schedule('seo-rebuild-hourly', '7 9,15,21 * * *', 'select ezial_private.request_seo_rebuild(false);');

select 'vérification toutes les 6 heures' as element,
       case when exists (select 1 from cron.job where jobname = 'seo-rebuild-hourly' and schedule = '7 9,15,21 * * *' and active
                         and command = 'select ezial_private.request_seo_rebuild(false);') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'reconstruction de nuit conservée',
       case when exists (select 1 from cron.job where jobname = 'seo-rebuild-nightly' and schedule = '17 3 * * *' and active) then 'ok' else 'À VÉRIFIER' end
union all
select 'aucune tâche en double',
       case when (select count(*) from cron.job where command like '%request_seo_rebuild%') = 2 then 'ok' else 'À VÉRIFIER' end;
