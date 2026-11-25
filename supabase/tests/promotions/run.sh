#!/usr/bin/env bash
# Banc de test LOCAL « Campagnes promotionnelles, phase 1 » : PostgreSQL 16 jetable, aucune connexion à la production.
# État de départ = production du 25 nov. 2026 :
#   banc orange-money (schéma simplifié + migrations Orange Money 1 à 6 ; Wave n'est PAS en production)
#   + lancement-livraison-urgente.sql (exécutée en production le 24-25 nov. ; lue dans docs/sql, sinon sur origin/main)
#   + 00-complement.sql (tables manquantes, données fictives) + 10-production.sql (texte EXACT de production de
#   create_order — avec la livraison urgente —, trg_orders_on_paid, validate_promo_code et des fonctions
#   d'annulation / de vente, contrôlé par empreinte md5).
# Déroulé : état de production -> scénario de référence SANS promotion -> migrations 1, 2, 3 appliquées DEUX fois
#   -> tests 2x/3x/4x/5x -> commandes simultanées (80) -> non-régression -> retours arrière (refus puis 3, 2, 1)
#   -> comparaison exacte avec l'état de départ et nouvelle non-régression (90).
# Usage : PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
# Tout est aussi recopié dans un journal pour le bilan final (nombre de vérifications OK / en échec).
LOGRES=$(mktemp)
exec > >(tee "$LOGRES") 2>&1
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
export DB=ezial_promo_test
SQL=../../../docs/sql
OM=../orange-money
URGENT=$SQL/lancement-livraison-urgente.sql
if [ ! -f "$URGENT" ]; then   # branche pas encore à jour de main : copie lue sur origin/main (lecture seule)
  URGENT=$(mktemp --suffix=.sql)
  git show origin/main:docs/sql/lancement-livraison-urgente.sql > "$URGENT"
fi
psql -qX -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
P() { PGOPTIONS="-c client_min_messages=notice" psql -qX -v ON_ERROR_STOP=1 -d $DB "$@" 2>&1 | { grep -v "NOTICE:  truncate cascades\|skipping" || true; } ; }
T() { echo "-- $1"; P -f "$1" 2>&1 | grep -E "OK|ÉCHEC|ERROR" || true; }
for f in $OM/00-scaffold.sql $OM/10-baseline.sql $OM/11-baseline-remplacees.sql $OM/12-baseline-autres.sql $OM/20-fixtures.sql $OM/14-vault-simule.sql \
         $SQL/orange-money-1-structure.sql $SQL/orange-money-2-commandes.sql $SQL/orange-money-3-stock.sql $SQL/orange-money-4-verification.sql \
         $SQL/orange-money-5-testeurs.sql $SQL/orange-money-6-cles-coffre.sql "$URGENT" 00-complement.sql 10-production.sql 11-aides-urgent.sql; do
  P -f "$f" >/dev/null
done
# Photographie de l'état de production (référence des retours arrière)
P -c "create table tests.base_defs as select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def, coalesce(p.proacl::text, '') acl from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" \
  -c "create table tests.base_policies as select c.relname::text rel, p.polname::text pol, p.polcmd::text cmd, coalesce(pg_get_expr(p.polqual, p.polrelid), '') u, coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') w from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace" \
  -c "create table tests.base_triggers as select tgname::text, tgrelid::regclass::text rel, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal" \
  -c "create table tests.base_columns as select table_name::text, column_name::text, data_type::text, coalesce(column_default, '') dflt from information_schema.columns where table_schema = 'public'" \
  -c "create table tests.base_tables as select tablename::text from pg_tables where schemaname in ('public', 'ezial_private')" >/dev/null
echo "== État de production (avant migrations)"
T tests/10-etat-production.sql
P -c "create table tests.reference as select tests.reference_scenario() v" >/dev/null
echo "OK    : scénario de référence sans promotion enregistré (production)"

echo "== Migration 2 refusée si create_order a changé depuis la lecture de production"
P -c "do \$\$ begin execute replace(replace((select def from tests.base_defs where sig = 'create_order(jsonb)'), chr(13), ''), 'promo_code = v_promo_code,', 'promo_code = upper(v_promo_code),'); end \$\$" >/dev/null
P -f $SQL/promotions-1-structure.sql >/dev/null
out=$(P -f $SQL/promotions-2-commande.sql || true)
if grep -q "rien n'a été modifié" <<<"$out" && [ "$(P -tA -c "select to_regprocedure('public.promotions_preview(jsonb)') is null and position('upper(v_promo_code)' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) > 0 and position('promo_compensation' in pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure)) = 0")" = "t" ]; then
  echo "OK    : repère introuvable -> migration 2 arrêtée, aucune fonction modifiée"; else echo "ÉCHEC : migration 2 non arrêtée sur une create_order différente"; fi
P -c "do \$\$ begin execute (select def from tests.base_defs where sig = 'create_order(jsonb)'); end \$\$" >/dev/null

echo "== Migrations 1, 2, 3, puis seconde application (idempotence)"
for m in promotions-1-structure promotions-2-commande promotions-3-admin; do P -f $SQL/$m.sql >/dev/null; done
P -c "create table tests.after_first as select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" >/dev/null
for m in promotions-1-structure promotions-2-commande promotions-3-admin; do P -f $SQL/$m.sql >/dev/null; done
T tests/20-migrations.sql

echo "== Tests fonctionnels"
for t in tests/3*.sql tests/4*.sql tests/5*.sql tests/6*.sql tests/7*.sql; do T "$t"; done
echo "-- tests/80-concurrence.sh"; ./tests/80-concurrence.sh || true

echo "== Retours arrière : refus tant qu'une commande utilise une campagne"
./build-rollback.sh >/dev/null
P -c "select tests.reset_promo(); select tests.new_promo('REFUS', 'fixed', 500); select tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{\"promoCode\": \"REFUS\"}')" >/dev/null
for r in promotions-3-retour-arriere promotions-2-retour-arriere promotions-1-retour-arriere; do
  out=$(P -f $SQL/$r.sql || true)
  if grep -q "retour arrière refusé" <<<"$out"; then echo "OK    : $r refusé tant qu'une commande non annulée utilise une campagne"; else echo "ÉCHEC : $r non refusé"; echo "$out" | head -5; fi
done
P -c "update public.orders set status = 'cancelled' where promotion_id is not null" >/dev/null
echo "== Retours arrière 3, 2, 1"
P -f $SQL/promotions-3-retour-arriere.sql >/dev/null
out=$(P -f $SQL/promotions-1-retour-arriere.sql || true)
if grep -q "promotions-2-retour-arriere" <<<"$out"; then echo "OK    : retour arrière 1 refusé tant que le 2 n'est pas exécuté"; else echo "ÉCHEC : retour arrière 1 accepté avant le 2"; fi
P -f $SQL/promotions-2-retour-arriere.sql >/dev/null
P -f $SQL/promotions-1-retour-arriere.sql >/dev/null
T tests/90-retour-arriere.sql

echo "== Réapplication après retour arrière (1, 2, 3)"
for m in promotions-1-structure promotions-2-commande promotions-3-admin; do P -f $SQL/$m.sql >/dev/null; done
P -c "drop table tests.after_first; create table tests.after_first as select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)" >/dev/null
T tests/20-migrations.sql
T tests/70-non-regression.sql
T tests/56-livraison-urgente.sql

echo
ok=$(grep -c "OK    :" "$LOGRES" || true); ko=$(grep -cE "ÉCHEC|ERROR" "$LOGRES" || true)
echo "Bilan : $ok vérifications OK, $ko échec(s) ou erreur(s)"
[ "$ko" -eq 0 ]
