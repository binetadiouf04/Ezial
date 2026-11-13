#!/usr/bin/env bash
# Archive un dossier, calcule son empreinte SHA-256, le chiffre (AES-256) avec
# la phrase secrète BACKUP_PASSPHRASE, puis vérifie que le fichier chiffré se
# déchiffre et redonne exactement la même empreinte.
#
# Usage : BACKUP_PASSPHRASE=... scripts/chiffrer.sh <dossier> <nom-archive> <dossier-de-sortie>
# La phrase secrète est transmise sur un descripteur de fichier : elle
# n'apparaît ni dans la liste des processus ni dans le journal.
set -euo pipefail
umask 077

: "${BACKUP_PASSPHRASE:?Variable BACKUP_PASSPHRASE manquante}"
[ "${#BACKUP_PASSPHRASE}" -ge 40 ] || { echo "REFUS : phrase secrète trop courte (40 caractères minimum)."; exit 1; }
SOURCE="${1:?dossier manquant}"; NOM="${2:?nom manquant}"; SORTIE="${3:?sortie manquante}"
[ -d "$SOURCE" ] || { echo "Dossier introuvable."; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SORTIE"
ARCHIVE="$TMP/$NOM.tar.gz"

tar -czf "$ARCHIVE" -C "$SOURCE" .
EMPREINTE="$(sha256sum "$ARCHIVE" | cut -d' ' -f1)"

gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --output "$SORTIE/$NOM.tar.gz.gpg" "$ARCHIVE" 3<<< "$BACKUP_PASSPHRASE"

VERIF="$(gpg --batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt "$SORTIE/$NOM.tar.gz.gpg" 3<<< "$BACKUP_PASSPHRASE" | sha256sum | cut -d' ' -f1)"
[ "$EMPREINTE" = "$VERIF" ] || { echo "ÉCHEC : le fichier chiffré ne redonne pas l'archive d'origine."; rm -f "$SORTIE/$NOM.tar.gz.gpg"; exit 1; }

# Empreinte de l'archive EN CLAIR : à comparer après déchiffrement lors d'une restauration.
echo "$EMPREINTE  $NOM.tar.gz" > "$SORTIE/$NOM.tar.gz.sha256"
echo "Archive chiffrée et vérifiée : $NOM.tar.gz.gpg ($(du -h "$SORTIE/$NOM.tar.gz.gpg" | cut -f1))."
