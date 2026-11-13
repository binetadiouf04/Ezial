#!/usr/bin/env bash
# Export en LECTURE SEULE de la base Supabase d'Ezial : structure, données,
# liste des tâches planifiées, nombre de lignes par table.
#
# Usage : SUPABASE_DB_URL=... scripts/exporter.sh [dossier]
# Rien n'est écrit dans la base d'origine. Aucune adresse de connexion ni
# donnée n'est affichée : seuls des messages d'état sortent dans le journal.
#
# Les listes de schémas exclus et les filtres « sed » reprennent ceux de
# l'outil officiel Supabase (« supabase db dump », version 3.1.0), sans son
# option « --role postgres » : le rôle de sauvegarde ne peut que lire.
set -euo pipefail
umask 077

: "${SUPABASE_DB_URL:?Variable SUPABASE_DB_URL manquante}"
PG_DUMP="${PG_DUMP:-pg_dump}"
PSQL="${PSQL:-psql}"
DOSSIER="${1:-sauvegarde}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT

masquer() {
  sed -E 's#postgres(ql)?://[^[:space:]"]+#[adresse masquée]#g; s#(password|user|host)=[^[:space:]]+#\1=[masqué]#g' | tail -n 12
}
echec() { echo "ÉCHEC : $1"; masquer < "$ERR" || true; exit 1; }

# Schémas gérés par la plateforme Supabase (recréés par elle, jamais à restaurer).
EXCLUS_STRUCTURE='information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault'
# Pour les données : on garde auth (comptes) et storage (liste des fichiers).
# cron et net sont exclus : les tâches planifiées sont sauvegardées à part, sous
# forme lisible, pour qu'une restauration d'essai ne puisse JAMAIS les exécuter.
EXCLUS_DONNEES='information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor|cron|net'

mkdir -p "$DOSSIER"

echo "1/5 Structure…"
"$PG_DUMP" "$SUPABASE_DB_URL" \
    --schema-only \
    --quote-all-identifier \
    --exclude-schema "$EXCLUS_STRUCTURE" \
    2> "$ERR" \
    | sed -E 's/^\\(un)?restrict .*$/-- &/' \
    | sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
    | sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
    | sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
    | sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
    | sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
    | sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
    | sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
    | sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
    | sed -E 's/^         WHEN TAG IN /-- &/' \
    | sed -E 's/^   EXECUTE FUNCTION /-- &/' \
    | sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
    | sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
    | sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
    | sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
    | sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
    | sed -E "s/^GRANT (.+) ON (.+) \"(information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault)\"/-- &/" \
    | sed -E "s/^REVOKE (.+) ON (.+) \"(information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault)\"/-- &/" \
    | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' \
    | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' \
    | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' \
    | sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
    | sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
    | sed -E 's/^ALTER TABLE "cron"/-- &/' \
    | sed -E 's/^SET transaction_timeout = 0;/-- &/' \
    | sed -E "/^--/d" \
    > "$DOSSIER/structure.sql" || echec "export de la structure impossible."

echo "2/5 Données…"
echo "SET session_replication_role = replica;" > "$DOSSIER/donnees.sql"
"$PG_DUMP" "$SUPABASE_DB_URL" \
    --data-only \
    --quote-all-identifier \
    --exclude-schema "$EXCLUS_DONNEES" \
    --exclude-table "auth.schema_migrations" \
    --exclude-table "storage.migrations" \
    --exclude-table "supabase_functions.migrations" \
    --schema "*" \
    2> "$ERR" \
    | sed -E 's/^\\(un)?restrict .*$/-- &/' \
    >> "$DOSSIER/donnees.sql" || echec "export des données impossible."
echo "RESET ALL;" >> "$DOSSIER/donnees.sql"

echo "3/5 Tâches planifiées (texte rejouable, jamais exécuté par les essais)…"
"$PSQL" "$SUPABASE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 \
    -c "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command) from cron.job where jobname is not null order by jobname" \
    > "$DOSSIER/taches-planifiees.sql" 2> "$ERR" || echec "lecture des tâches planifiées impossible."

echo "4/5 Règles d'accès des fichiers et déclencheurs sur les comptes…"
# Les schémas auth et storage sont recréés par Supabase, mais PAS les règles
# d'accès et déclencheurs qu'Ezial y a ajoutés : on les sauvegarde à part.
"$PSQL" "$SUPABASE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -f "$ICI/objets-auth-storage.sql" \
    > "$DOSSIER/objets-auth-storage.sql" 2> "$ERR" || echec "lecture des règles d'accès des fichiers impossible."

echo "5/5 Nombre de lignes par table…"
"$PSQL" "$SUPABASE_DB_URL" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -f "$ICI/compter.sql" \
    > "$DOSSIER/lignes-origine.txt" 2> "$ERR" || echec "comptage impossible."

[ -s "$DOSSIER/structure.sql" ] || echec "structure vide."
grep -q '^COPY ' "$DOSSIER/donnees.sql" || echec "aucune donnée exportée."
[ -s "$DOSSIER/lignes-origine.txt" ] || echec "comptage vide."

# Seuls des chiffres (aucune donnée personnelle) sortent dans le journal.
echo "Export terminé : $(wc -l < "$DOSSIER/lignes-origine.txt") tables, $(awk -F'\t' '{s+=$2} END {print s+0}' "$DOSSIER/lignes-origine.txt") lignes au total."
