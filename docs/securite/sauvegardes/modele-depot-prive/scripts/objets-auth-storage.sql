-- Produit un texte SQL rejouable avec ce qu'Ezial a ajouté dans les schémas
-- gérés par Supabase (auth, storage) : règles d'accès (RLS) et déclencheurs.
-- Lecture seule.

-- Chemin de recherche vide : tous les noms sortent avec leur schéma.
set search_path to '';

select format('drop policy if exists %I on %I.%I;', p.policyname, p.schemaname, p.tablename) || E'\n' ||
       format('create policy %I on %I.%I as %s for %s to %s%s%s;',
              p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd,
              (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r),
              case when p.qual is not null then ' using (' || p.qual || ')' else '' end,
              case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end)
from pg_catalog.pg_policies p
where p.schemaname in ('auth', 'storage')
order by p.schemaname, p.tablename, p.policyname;

select format('drop trigger if exists %I on %I.%I;', t.tgname, n.nspname, c.relname) || E'\n' ||
       pg_catalog.pg_get_triggerdef(t.oid) || ';'
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc f on f.oid = t.tgfoid
join pg_catalog.pg_namespace fn on fn.oid = f.pronamespace
where n.nspname in ('auth', 'storage')
  and not t.tgisinternal
  and fn.nspname not in ('auth', 'storage', 'realtime', 'extensions', 'pg_catalog')
order by n.nspname, c.relname, t.tgname;
