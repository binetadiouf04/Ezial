#!/usr/bin/env bash
# Teste docs/sql/lancement-boutiques.sql (et son retour arrière) sur une base
# PostgreSQL LOCALE jetable. Jamais sur la production.
# Usage : PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=${DB:-ezial_boutiques_activation_test}
SQL=../../../docs/sql
dropdb --if-exists "$DB"
createdb "$DB"
P="psql -X -q -t -v ON_ERROR_STOP=1 -d $DB"
$P -f 00-scaffold.sql
$P -f 10-baseline.sql
echo '--- migration (1re exécution)'
$P -f "$SQL/lancement-boutiques.sql" > /dev/null
echo '--- migration (2e exécution : idempotence)'
$P -f "$SQL/lancement-boutiques.sql" > /dev/null
echo '--- scénarios'
OUT=$($P -f 20-tests.sql 2>&1) || { echo "$OUT"; exit 1; }
echo "$OUT" | grep -E 'OK :|ÉCHEC|ERR|WARN|AVERT|TOUS'
echo '--- retour arrière'
$P -f "$SQL/lancement-boutiques-retour.sql"
$P -Atc "select count(*) from pg_trigger where tgname in ('trg_activate_shops_on_email_confirmed','trg_activate_new_shop_if_owner_confirmed')" | grep -qx 0 && echo 'retour arrière : déclencheurs supprimés'
$P -Atc "select to_regprocedure('ezial_private.activate_shop_on_email_confirmed(uuid)') is null" | grep -qx t && echo 'retour arrière : fonction supprimée'
$P -Atc "select position('description' in pg_get_functiondef('public.activate_shop_if_ready()'::regprocedure)) > 0" | grep -qx t && echo 'retour arrière : activate_shop_if_ready de production rétablie'
echo '--- migration réappliquée après retour arrière'
$P -f "$SQL/lancement-boutiques.sql" > /dev/null && echo 'réapplication : succès'
dropdb "$DB"
