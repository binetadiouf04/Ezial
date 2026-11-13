#!/usr/bin/env bash
# Restauration d'ESSAI dans une base temporaire et isolée, pour prouver que la
# sauvegarde est réellement restaurable. Ne touche JAMAIS la production : le
# script refuse toute cible qui n'est pas sur la machine elle-même.
#
# Usage : LOCAL_DB_URL=postgresql://…@127.0.0.1:…/… scripts/essai-restauration.sh [dossier]
set -euo pipefail
umask 077

: "${LOCAL_DB_URL:?Variable LOCAL_DB_URL manquante}"
PSQL="${PSQL:-psql}"
DOSSIER="${1:-sauvegarde}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Garde-fous : cible locale uniquement, et différente de la base d'origine.
if ! [[ "$LOCAL_DB_URL" =~ ^postgres(ql)?://[^@/]+@(127\.0\.0\.1|localhost)(:[0-9]+)?/ ]]; then
  echo "REFUS : la restauration d'essai n'est autorisée que vers une base locale (127.0.0.1)."; exit 1
fi
if [ -n "${SUPABASE_DB_URL:-}" ] && [ "$LOCAL_DB_URL" = "$SUPABASE_DB_URL" ]; then
  echo "REFUS : la cible de l'essai est la base d'origine."; exit 1
fi
if [[ "$LOCAL_DB_URL" == *supabase.co* || "$LOCAL_DB_URL" == *supabase.com* ]]; then
  echo "REFUS : la cible de l'essai ressemble à une base Supabase en ligne."; exit 1
fi

ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT
echec() { echo "ÉCHEC DE L'ESSAI : $1"; grep -E '^(psql:|ERROR|ERREUR)' "$ERR" | sed -E 's#postgres(ql)?://[^[:space:]"]+#[adresse masquée]#g' | cut -c1-300 | head -n 5 || true; exit 1; }

echo "1/3 Restauration de la structure…"
"$PSQL" "$LOCAL_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DOSSIER/structure.sql" > /dev/null 2> "$ERR" || echec "la structure ne se restaure pas."
if [ -s "$DOSSIER/objets-auth-storage.sql" ]; then
  "$PSQL" "$LOCAL_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DOSSIER/objets-auth-storage.sql" > /dev/null 2> "$ERR" || echec "les règles d'accès des fichiers ne se restaurent pas."
fi
echo "2/3 Restauration des données…"
"$PSQL" "$LOCAL_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DOSSIER/donnees.sql" > /dev/null 2> "$ERR" || echec "les données ne se restaurent pas."
echo "3/3 Comparaison du nombre de lignes…"
"$PSQL" "$LOCAL_DB_URL" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -f "$ICI/compter.sql" > "$DOSSIER/lignes-restaurees.txt" 2> "$ERR" || echec "comptage impossible sur la base restaurée."

# Le site reste ouvert pendant l'export : une table peut gagner ou perdre
# quelques lignes entre l'export et le comptage. Écart toléré par table :
# 3 lignes ou 2 %. Une table absente, ou vide alors qu'elle contenait des
# lignes à l'origine, fait échouer l'essai.
awk -F'\t' '
  NR == FNR { origine[$1] = $2; next }
  { restaure[$1] = $2 }
  END {
    probleme = 0
    for (t in origine) {
      if (!(t in restaure)) { printf "  table absente après restauration : %s\n", t; probleme = 1; continue }
      ecart = origine[t] - restaure[t]; if (ecart < 0) ecart = -ecart
      tolere = origine[t] * 0.02; if (tolere < 3) tolere = 3
      if (ecart > tolere || (origine[t] >= 1 && restaure[t] == 0)) {
        printf "  écart sur %s : %d lignes à l origine, %d restaurées\n", t, origine[t], restaure[t]; probleme = 1
      }
    }
    exit probleme
  }' "$DOSSIER/lignes-origine.txt" "$DOSSIER/lignes-restaurees.txt" || { echo "ÉCHEC DE L'ESSAI : la base restaurée ne correspond pas à l'origine."; exit 1; }

echo "Essai réussi : $(wc -l < "$DOSSIER/lignes-restaurees.txt") tables restaurées, nombres de lignes conformes."
