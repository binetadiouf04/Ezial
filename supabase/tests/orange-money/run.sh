#!/usr/bin/env bash
# Banc de test local Orange Money : PostgreSQL 16 jetable, aucune connexion à la production.
# Usage : PGPORT=54555 PGHOST=/tmp ./run.sh [avant|migrations|tout]
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=ezial_om_test
SQL=../../../docs/sql
psql -qX -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P() { PGOPTIONS="-c client_min_messages=notice" psql -qX -v ON_ERROR_STOP=1 -d $DB "$@" 2>&1 | { grep -v "NOTICE:  truncate cascades\|skipping" || true; } ; }
for f in 00-scaffold.sql 10-baseline.sql 11-baseline-remplacees.sql 12-baseline-autres.sql 20-fixtures.sql; do P -f "$f" >/dev/null; done
P -c "create table tests.baseline_defs as select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace in ('public'::regnamespace,'ezial_private'::regnamespace)" \
  -c "create table tests.baseline_policies as select c.relname::text rel, p.polname::text pol, p.polcmd::text cmd, coalesce(pg_get_expr(p.polqual, p.polrelid),'') u, coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'') w from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace" \
  -c "create table tests.baseline_triggers as select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal" >/dev/null
echo "== État de production (avant migrations)"
for t in tests/10-*.sql; do echo "-- $t"; P -f "$t" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; done
echo "== Application des migrations 1 à 5"
for m in orange-money-1-structure orange-money-2-commandes orange-money-3-stock orange-money-4-verification orange-money-5-testeurs; do P -f $SQL/$m.sql >/dev/null; done
echo "== Une seconde application (idempotence)"
for m in orange-money-1-structure orange-money-2-commandes orange-money-3-stock orange-money-4-verification orange-money-5-testeurs; do P -f $SQL/$m.sql >/dev/null; done
echo "OK    : migrations relançables sans erreur"
for t in tests/3*.sql; do echo "-- $t"; P -f "$t" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; done
echo "-- tests/80-concurrence.sh"; ./tests/80-concurrence.sh
echo "== Retour arrière (migration 5, puis migrations 1 à 4)"
P -f $SQL/orange-money-5-retour-arriere.sql >/dev/null
P -c "select tests.check(to_regclass('public.payment_testers') is null, 'Retour arrière 5 : liste des testeurs supprimée')" 2>&1 | grep -E 'OK|ÉCHEC|ERROR' || true
./build-rollback.sh >/dev/null
P -f $SQL/orange-money-retour-arriere.sql >/dev/null
for t in tests/90-*.sql; do echo "-- $t"; P -f "$t" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; done
