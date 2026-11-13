-- Nombre de lignes de chaque table sauvegardée (toutes les tables d'Ezial, les
-- comptes et la liste des fichiers). Lecture seule. Sortie : table <tab> lignes.
select format('%I.%I', t.schemaname, t.tablename) as table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', t.schemaname, t.tablename), false, true, '')
       ))[1]::text::bigint as lignes
from pg_catalog.pg_tables t
where t.schemaname in ('public', 'ezial_private')
   or (t.schemaname = 'auth' and t.tablename in ('users', 'identities'))
   or (t.schemaname = 'storage' and t.tablename in ('buckets', 'objects'))
order by 1;
