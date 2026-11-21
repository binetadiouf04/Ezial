#!/usr/bin/env bash
# Banc de test local Wave : PostgreSQL 16 jetable, aucune connexion à la production.
# Part de l'état « Orange Money en production » (migrations orange-money-1 à 6), vérifie que les tests Orange Money
# passent AVANT, APRÈS wave-1-commandes.sql (appliquée deux fois) et APRÈS le retour arrière, avec les tests Wave au milieu.
# Usage : PGPORT=54555 PGHOST=/tmp ./run-wave.sh
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=ezial_wave_test
SQL=../../../docs/sql
psql -qX -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P() { PGOPTIONS="-c client_min_messages=notice" psql -qX -v ON_ERROR_STOP=1 -d $DB "$@" 2>&1 | { grep -v "NOTICE:  truncate cascades\|skipping" || true; } ; }
ORANGE="orange-money-1-structure orange-money-2-commandes orange-money-3-stock orange-money-4-verification orange-money-5-testeurs"
for f in 00-scaffold.sql 10-baseline.sql 11-baseline-remplacees.sql 12-baseline-autres.sql 20-fixtures.sql 21-fixtures-wave.sql 14-vault-simule.sql; do P -f "$f" >/dev/null; done
for m in $ORANGE orange-money-6-cles-coffre; do P -f $SQL/$m.sql >/dev/null; done
# Photographie de l'état d'avant Wave (référence du retour arrière)
P -c "create table tests.wave_baseline_defs as select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace in ('public'::regnamespace,'ezial_private'::regnamespace)" \
  -c "create table tests.wave_baseline_acl as select p.oid::regprocedure::text sig, coalesce(p.proacl::text,'') acl from pg_proc p where p.pronamespace in ('public'::regnamespace,'ezial_private'::regnamespace)" \
  -c "create table tests.wave_baseline_policies as select c.relname::text rel, p.polname::text pol, p.polcmd::text cmd, coalesce(pg_get_expr(p.polqual, p.polrelid),'') u, coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'') w from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace" \
  -c "create table tests.wave_baseline_triggers as select tgname::text, tgrelid::regclass::text from pg_trigger where not tgisinternal" >/dev/null
TMP=$(mktemp -d)
# Les tests Orange Money sont rejoués TELS QUELS (avant Wave et après le retour arrière). Après Wave, deux assertions
# portent sur ce que la demande Wave change volontairement et sont adaptées dans une copie temporaire (les fichiers ne sont pas modifiés) :
#   - 30 : « Wave expire toujours sur l'horloge locale » (dernier bloc) -> remplacé par les tests 41 et 42 (Wave n'expire jamais localement) ;
#   - 35 : droits de payments_reconcile_candidates(integer) -> nouvelle signature (integer, text).
orange_tests() {
  local mode="${1:-tel-quel}" f
  for t in tests/3*.sql; do
    f="$t"
    if [ "$mode" = "apres-wave" ]; then
      f="$TMP/$(basename "$t")"
      case "$t" in
        tests/30-*) sed '/^-- Maintenance : Wave expire toujours/,$d' "$t" > "$f" ;;
        tests/35-*) sed 's/payments_reconcile_candidates(integer)/payments_reconcile_candidates(integer, text)/g' "$t" > "$f" ;;
        *) cp "$t" "$f" ;;
      esac
    fi
    echo "-- $t"; P -f "$f" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true
  done
  echo "-- tests/80-concurrence.sh"; sed "s/^DB=.*/DB=$DB/" tests/80-concurrence.sh | bash
}

echo "== ORANGE MONEY AVANT Wave (migrations 1 à 6 seulement)"
orange_tests
echo "== Application de wave-1-commandes.sql, puis seconde application (idempotence)"
P -f $SQL/wave-1-commandes.sql >/dev/null
P -f $SQL/wave-1-commandes.sql >/dev/null
echo "OK    : migration Wave relançable sans erreur"
echo "== ORANGE MONEY APRÈS Wave (mêmes tests ; 2 assertions adaptées, voir plus haut)"
orange_tests apres-wave
echo "== TESTS WAVE"
for t in tests/4*.sql; do echo "-- $t"; P -f "$t" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; done
echo "-- tests/81-wave-concurrence.sh"; DB=$DB ./tests/81-wave-concurrence.sh
echo "== Retour arrière : refus tant que Wave est actif"
P -c "select tests.reset_wave(); update public.payment_settings set wave_enabled = true;" >/dev/null
out=$(P -f $SQL/wave-retour-arriere.sql || true); if grep -q "wave_enabled est encore" <<<"$out"; then echo "OK    : retour arrière refusé tant que wave_enabled est vrai"; else echo "ÉCHEC : retour arrière non refusé (interrupteur allumé)"; fi
P -c "update public.payment_settings set wave_enabled = false; select tests.reset_wave(); insert into public.payment_testers (user_id, providers) values ('00000000-0000-4000-8000-0000000000c2', array['wave']);" >/dev/null
out=$(P -f $SQL/wave-retour-arriere.sql || true); if grep -q "testeurs Wave" <<<"$out"; then echo "OK    : retour arrière refusé tant qu'un testeur Wave existe"; else echo "ÉCHEC : retour arrière non refusé (testeur Wave)"; fi
P -c "select tests.reset_wave(); update public.payment_settings set wave_enabled = true;" >/dev/null
P -c "select tests.put('x', to_jsonb(tests.place('wave'))); update public.payment_settings set wave_enabled = false;" >/dev/null
out=$(P -f $SQL/wave-retour-arriere.sql || true); if grep -q "attendent encore un paiement" <<<"$out"; then echo "OK    : retour arrière refusé tant qu'une commande Wave attend son paiement"; else echo "ÉCHEC : retour arrière non refusé (commande en attente)"; fi
P -c "select tests.reset_wave();" >/dev/null
echo "== Retour arrière Wave"
./build-rollback-wave.sh >/dev/null
P -f $SQL/wave-retour-arriere.sql >/dev/null
for t in tests/98-*.sql; do echo "-- $t"; P -f "$t" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; done
echo "== ORANGE MONEY APRÈS retour arrière Wave"
orange_tests
