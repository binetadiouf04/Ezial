#!/usr/bin/env bash
# Banc de test LOCAL « Abonnement Ezial Plus payé avec Orange Money » : PostgreSQL 16 jetable, aucune connexion à la production.
# État de départ = production du 25 nov. 2026 : banc orange-money (schéma simplifié + migrations Orange Money 1 à 6)
#   + 10-production.sql de CE banc (abonnements, remboursements : texte EXACT de production, empreintes md5 contrôlées).
# Prérequis chargés avant : migrations Orange Money 1 à 6 et retour-paiement.
# Déroulé : état de production -> migration refusée si une fonction a changé -> migration appliquée DEUX fois (idempotence)
#   -> tests fonctionnels (30 à 38) -> accès simultanés (80) -> retour arrière (refusé tant qu'un paiement confirmé existe,
#   puis accepté, rejoué) -> comparaison exacte avec l'état de départ -> réapplication -> non-régression.
# Usage : PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
LOGRES=$(mktemp)
exec > >(tee "$LOGRES") 2>&1
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
export DB=ezial_abo_test
SQL=../../../docs/sql
OM=../orange-money
psql -qX -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
P() { PGOPTIONS="-c client_min_messages=notice" psql -qX -v ON_ERROR_STOP=1 -d $DB "$@" 2>&1 | { grep -v "NOTICE:  truncate cascades\|skipping" || true; } ; }
T() { echo "-- $1"; P -f "$1" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; }
for f in $OM/00-scaffold.sql $OM/10-baseline.sql $OM/11-baseline-remplacees.sql $OM/12-baseline-autres.sql $OM/20-fixtures.sql $OM/14-vault-simule.sql \
         $SQL/orange-money-1-structure.sql $SQL/orange-money-2-commandes.sql $SQL/orange-money-3-stock.sql $SQL/orange-money-4-verification.sql \
         $SQL/orange-money-5-testeurs.sql $SQL/orange-money-6-cles-coffre.sql $SQL/retour-paiement.sql 10-production.sql; do
  out=$(P -f "$f") || { echo "ÉCHEC : chargement de $f"; echo "$out" | head -8; exit 1; }
done
# Photographie de l'état de production (référence du retour arrière)
P -c "create table tests.base_defs as select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def, coalesce(p.proacl::text, '') acl from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" \
  -c "create table tests.base_policies as select c.relname::text rel, p.polname::text pol, p.polcmd::text cmd, coalesce(pg_get_expr(p.polqual, p.polrelid), '') u, coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') w from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace" \
  -c "create table tests.base_triggers as select tgname::text, tgrelid::regclass::text rel, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal" \
  -c "create table tests.base_columns as select table_name::text, column_name::text, data_type::text, coalesce(column_default, '') dflt from information_schema.columns where table_schema = 'public'" >/dev/null
# Comme en production (Supabase) : tout objet créé par postgres dans « public » est d'abord accessible à anon / authenticated.
P -c "alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role" \
  -c "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role" >/dev/null

echo "== État de production (avant migration)"
T tests/10-etat-production.sql

echo "== Migration refusée si une fonction de production a changé"
P -c "do \$\$ begin execute replace((select def from tests.base_defs where sig = 'process_subscription_expirations()'), 'subscription_expiring_soon', 'subscription_expiring_soon_x'); end \$\$" >/dev/null
out=$(P -f $SQL/abonnement-om.sql || true)
if grep -q "rien n'a été modifié" <<<"$out" && [ "$(P -tA -c "select to_regclass('public.subscription_payment_attempts') is null and to_regclass('ezial_private.abonnement_om_saved_functions') is null and to_regprocedure('public.subscription_payments_confirm(uuid,text,integer)') is null")" = "t" ]; then
  echo "OK    : fonction de production différente -> migration arrêtée, rien n'a été modifié"; else echo "ÉCHEC : migration non arrêtée sur une fonction différente"; echo "$out" | head -5; fi
P -c "do \$\$ begin execute (select def from tests.base_defs where sig = 'process_subscription_expirations()'); end \$\$" >/dev/null
echo "== Migration refusée si un remboursement « espèces » existe"
P -c "insert into public.order_shop_cancellations (refund_status, part_amount, refunded_at, refund_method) values ('refunded', 1000, now(), 'especes')" >/dev/null
out=$(P -f $SQL/abonnement-om.sql || true)
if grep -q "rien n'a été modifié" <<<"$out" && [ "$(P -tA -c "select to_regclass('public.subscription_payment_attempts') is null")" = "t" ]; then
  echo "OK    : remboursement « espèces » existant -> migration arrêtée, rien n'a été modifié"; else echo "ÉCHEC : migration non arrêtée"; echo "$out" | head -5; fi
P -c "delete from public.order_shop_cancellations" >/dev/null

echo "== Migration, puis seconde application (idempotence)"
P -f $SQL/abonnement-om.sql >/dev/null
P -c "create table tests.after_first as select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" >/dev/null
P -f $SQL/abonnement-om.sql >/dev/null
P -f 20-aides.sql >/dev/null
T tests/20-migration.sql

echo "== Tests fonctionnels"
for t in tests/3*.sql; do T "$t"; done
echo "-- tests/80-concurrence.sh"; ./tests/80-concurrence.sh || true

echo "== Retour arrière : refusé tant qu'un paiement confirmé existe"
P -c "select tests.reset_abo()" >/dev/null
P -c "select tests.attempt(tests.mkshop())" >/dev/null
a=$(P -tA -c "select id from public.subscription_payment_attempts limit 1")
P -c "select public.subscription_payments_record_verification('$a', 'confirmed', 6000, 'MPRB')" >/dev/null
out=$(P -f $SQL/abonnement-om-retour.sql || true)
if grep -q "Retour arrière refusé" <<<"$out" && [ "$(P -tA -c "select to_regprocedure('public.subscription_payments_confirm(uuid,text,integer)') is not null")" = "t" ]; then
  echo "OK    : retour arrière refusé tant qu'un paiement confirmé existe (rien n'a été modifié)"; else echo "ÉCHEC : retour arrière non refusé"; echo "$out" | head -5; fi
echo "== Retour arrière puis rejeu (historique de test supprimé)"
P -c "select tests.reset_abo()" >/dev/null
P -f $SQL/abonnement-om-retour.sql >/dev/null
P -f $SQL/abonnement-om-retour.sql >/dev/null
echo "OK    : retour arrière rejoué une seconde fois sans erreur"
T tests/90-retour-arriere.sql

echo "== Réapplication après retour arrière"
P -f $SQL/abonnement-om.sql >/dev/null
P -c "drop table tests.after_first; create table tests.after_first as select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" >/dev/null
P -f $SQL/abonnement-om.sql >/dev/null
T tests/20-migration.sql
T tests/70-reapplication.sql
T tests/37-commandes.sql

echo
ok=$(grep -c "OK    :" "$LOGRES" || true); ko=$(grep -cE "ÉCHEC|ERROR" "$LOGRES" || true)
echo "Bilan : $ok vérifications OK, $ko échec(s) ou erreur(s)"
[ "$ko" -eq 0 ]
