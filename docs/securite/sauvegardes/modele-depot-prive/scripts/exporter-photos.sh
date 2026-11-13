#!/usr/bin/env bash
# Copie des photos PUBLIQUES d'Ezial (produits, boutiques, contenus du site).
# Les fichiers ne font jamais partie d'une sauvegarde de base de données.
#
# Usage : SUPABASE_DB_URL=... SUPABASE_URL=https://xxxx.supabase.co scripts/exporter-photos.sh [dossier]
#
# Seuls les dossiers publics sont copiés (lisibles sans clé). Le dossier privé
# « secure-photos » (preuves de livraison, réclamations) n'est PAS copié : il
# faudrait une clé serveur, volontairement absente de ce dépôt.
set -euo pipefail
umask 077

: "${SUPABASE_DB_URL:?Variable SUPABASE_DB_URL manquante}"
: "${SUPABASE_URL:?Variable SUPABASE_URL manquante}"
PSQL="${PSQL:-psql}"
DOSSIER="${1:-photos}"
ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT

mkdir -p "$DOSSIER/fichiers"
"$PSQL" "$SUPABASE_DB_URL" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 \
  -c "select o.bucket_id, coalesce((o.metadata->>'size')::bigint, -1), o.name
      from storage.objects o join storage.buckets b on b.id = o.bucket_id
      where b.public and o.name not like '%/.emptyFolderPlaceholder' and o.name <> '.emptyFolderPlaceholder'
      order by 1, 3" > "$DOSSIER/liste.tsv" 2> "$ERR" || { echo "ÉCHEC : lecture de la liste des photos impossible."; exit 1; }

TOTAL=$(wc -l < "$DOSSIER/liste.tsv"); ECHECS=0; OCTETS=0
while IFS=$'\t' read -r BUCKET TAILLE NOM; do
  # Aucun chemin ne doit pouvoir sortir du dossier de sauvegarde.
  case "/$NOM/" in *"/../"*|*"/./"*) ECHECS=$((ECHECS + 1)); continue ;; esac
  DEST="$DOSSIER/fichiers/$BUCKET/$NOM"
  mkdir -p "$(dirname "$DEST")"
  CHEMIN=$(python3 -c 'import sys, urllib.parse; print("/".join(urllib.parse.quote(p, safe="") for p in sys.argv[1].split("/")))' "$NOM")
  if curl -sS --fail --retry 3 --max-time 180 -o "$DEST" "$SUPABASE_URL/storage/v1/object/public/$BUCKET/$CHEMIN" 2> /dev/null; then
    RECU=$(stat -c %s "$DEST")
    # Intégrité : la taille reçue doit être celle enregistrée par Supabase.
    if [ "$TAILLE" -ge 0 ] && [ "$RECU" -ne "$TAILLE" ]; then ECHECS=$((ECHECS + 1)); fi
    OCTETS=$((OCTETS + RECU))
  else
    ECHECS=$((ECHECS + 1))
  fi
done < "$DOSSIER/liste.tsv"

echo "Photos listées : $TOTAL — copiées : $((TOTAL - ECHECS)) — en échec : $ECHECS — volume : $((OCTETS / 1048576)) Mo"
[ "$ECHECS" -eq 0 ] || { echo "ÉCHEC : toutes les photos n'ont pas pu être copiées à l'identique."; exit 1; }
