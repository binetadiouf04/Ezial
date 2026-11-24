#!/usr/bin/env bash
# Banc de test local LIVRAISON URGENTE : PostgreSQL 16 jetable, aucune connexion à la production.
# Part du schéma simplifié du banc Orange Money/Wave (../orange-money), amené à l'état de production
# (migrations orange-money-1 à 6 + wave-1), puis remplace create_order par la définition EXACTE de production
# relue le 24 nov. 2026 (05-create-order-production.sql, empreinte vérifiée).
# Ordre : commandes de référence AVANT -> migration x2 (idempotence) -> tests -> retour arrière (2 cas) -> réapplication.
# Usage : PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run.sh
set -uo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=ezial_urgent_test
SQL=../../../docs/sql
OM=../orange-money
LOG=$(mktemp)
psql -qX -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
S() { psql -qX -v ON_ERROR_STOP=1 -d $DB "$@" >/dev/null 2>>"$LOG" || { echo "ERREUR de mise en place : $*"; cat "$LOG"; exit 1; }; }
# Tests : chaque bloc s'exécute même si un précédent échoue ; seules les lignes OK / ÉCHEC / ERROR sont affichées.
T() { PGOPTIONS="-c client_min_messages=notice" psql -qX -d $DB "$@" 2>&1 | grep -E "OK    :|ÉCHEC|ERROR" | sed 's/^.*NOTICE:  //' | tee -a "$LOG.res"; }
: > "$LOG.res"

for f in 00-scaffold.sql 10-baseline.sql 11-baseline-remplacees.sql 12-baseline-autres.sql 20-fixtures.sql 21-fixtures-wave.sql 14-vault-simule.sql; do S -f "$OM/$f"; done
for m in orange-money-1-structure orange-money-2-commandes orange-money-3-stock orange-money-4-verification orange-money-5-testeurs orange-money-6-cles-coffre wave-1-commandes; do S -f "$SQL/$m.sql"; done
S -f 05-create-order-production.sql
S -f 06-fixtures.sql

echo "== État de production (create_order relu le 24 nov. 2026)"
T -f tests/10-avant.sql
echo "== Migration lancement-livraison-urgente.sql, appliquée deux fois"
S -f $SQL/lancement-livraison-urgente.sql
S -f $SQL/lancement-livraison-urgente.sql
echo "OK    : migration relançable sans erreur" | tee -a "$LOG.res"
T -f tests/20-apres.sql
T -f tests/30-reglages.sql
echo "== Retour arrière"
T -f tests/90-retour-arriere.sql

echo
ok=$(grep -c "^OK" "$LOG.res"); ko=$(grep -cE "ÉCHEC|ERROR" "$LOG.res")
echo "Bilan : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
