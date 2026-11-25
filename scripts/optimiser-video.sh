#!/usr/bin/env bash
# Optimise localement une ou plusieurs vidéos produit déjà en ligne (ou n'importe quelle vidéo) avec ffmpeg,
# avec les mêmes réglages que l'optimisation faite dans le navigateur du vendeur (src/lib/videoOptimizeCore.ts) :
# MP4 H.264 + AAC, côté long ≤ 1280 (720p, orientation conservée), ~1,5 Mbit/s, 30 i/s max, 30 s max,
# index « moov » en tête (faststart), plus une image de couverture JPEG de 720 px de large.
#
# SÛR : ce script ne se connecte à rien, ne supprime rien et n'écrase rien. Il lit les fichiers donnés
# en argument et écrit de NOUVEAUX fichiers dans ./videos-optimisees/ (refuse d'écraser un fichier existant).
# Le téléversement vers Supabase Storage et la mise à jour de la ligne product_images
# (storage_path, thumbnail_storage_path) se font ensuite, après accord, séparément.
#
# Usage : scripts/optimiser-video.sh IMG_0360.mov autre-video.mp4
set -euo pipefail

if [ "$#" -eq 0 ]; then echo "Usage : $0 video1 [video2 ...]" >&2; exit 1; fi
command -v ffmpeg >/dev/null || { echo "ffmpeg est requis (https://ffmpeg.org)." >&2; exit 1; }
OUT="videos-optimisees"
mkdir -p "$OUT"

for src in "$@"; do
  [ -f "$src" ] || { echo "Introuvable : $src" >&2; continue; }
  base="$(basename "${src%.*}")"
  video="$OUT/$base-optimisee.mp4"
  cover="$OUT/$base-couverture.jpg"
  if [ -e "$video" ] || [ -e "$cover" ]; then echo "Déjà présent, non écrasé : $video" >&2; continue; fi

  # Redimensionne seulement si le côté long dépasse 1280 ; dimensions paires ; orientation iPhone appliquée par ffmpeg.
  vf="scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',fps=fps=30"
  has_audio="$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$src" | head -n1 || true)"
  audio=(-an)
  if [ -n "$has_audio" ]; then audio=(-c:a aac -b:a 96k -ac 2); fi

  ffmpeg -nostdin -loglevel error -i "$src" -t 30 -vf "$vf" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 1500k -maxrate 1800k -bufsize 3600k -g 60 \
    "${audio[@]}" -movflags +faststart "$video"
  ffmpeg -nostdin -loglevel error -ss 0.5 -i "$video" -frames:v 1 -vf "scale='min(720,iw)':-2" -q:v 4 "$cover"

  before="$(wc -c < "$src")"; after="$(wc -c < "$video")"
  echo "$src : $((before/1024)) Ko -> $((after/1024)) Ko  ($video, $cover)"
done
