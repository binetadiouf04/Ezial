-- Rôle de LECTURE SEULE pour les sauvegardes automatiques.
-- À exécuter une seule fois dans l'éditeur SQL de Supabase, APRÈS avoir
-- remplacé REMPLACER_PAR_UN_MOT_DE_PASSE_LONG par un mot de passe généré
-- (40 caractères, lettres et chiffres uniquement). Ne mettez jamais ce mot de
-- passe dans une conversation, un e-mail ou un dépôt : il va uniquement dans
-- le secret SUPABASE_DB_URL du dépôt privé de sauvegardes.
--
-- Ce rôle peut tout LIRE (nécessaire pour sauvegarder) mais ne peut rien
-- modifier ni supprimer. S'il fuitait, la base ne pourrait pas être altérée ;
-- les données pourraient en revanche être lues : il reste un secret.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'ezial_backup') then
    raise exception 'Le rôle ezial_backup existe déjà. Pour changer son mot de passe : alter role ezial_backup password ''...'';';
  end if;
end $$;

create role ezial_backup with login bypassrls password 'REMPLACER_PAR_UN_MOT_DE_PASSE_LONG';
grant pg_read_all_data to ezial_backup;
alter role ezial_backup set default_transaction_read_only = on;
alter role ezial_backup set statement_timeout = '10min';

select 'rôle de sauvegarde en lecture seule' as element,
       case when exists (select 1 from pg_roles where rolname = 'ezial_backup' and rolcanlogin and rolbypassrls and not rolsuper and not rolcreaterole and not rolcreatedb) then 'ok' else 'À VÉRIFIER' end as etat;

-- Pour le supprimer : drop role ezial_backup;
