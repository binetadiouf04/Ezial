// Règles de l'optimisation des vidéos produit, sans aucune dépendance (testées
// par `npm run test:security`). Le transcodage lui-même est dans
// videoOptimize.ts, qui charge son muxeur à la demande.
//
// Objectif (demande de la propriétaire, 25 nov. 2026) : chaque vidéo pèse peu,
// démarre presque instantanément (index « moov » en tête du fichier), et ne
// ralentit jamais le reste du site.

import type { VideoInspection } from './videoInspect';

/** Durée maximale d'une vidéo produit (secondes). */
export const MAX_VIDEO_SECONDS = 30;
/** Côté le plus long de la vidéo envoyée (720p ; l'orientation est conservée). */
export const MAX_VIDEO_LONG_SIDE = 1280;
/** Débit visé pour la vidéo (bit/s) : ~1,5 Mbit/s, soit ~5,6 Mo pour 30 s avec le son. */
export const TARGET_VIDEO_BITRATE = 1_500_000;
export const MAX_VIDEO_FPS = 30;
/** Vidéo d'origine acceptée avant optimisation (lue par morceaux, jamais chargée en entier en mémoire). */
export const MAX_VIDEO_SOURCE_MB = 500;
/** Poids maximal du fichier réellement envoyé, après optimisation. */
export const MAX_VIDEO_UPLOAD_MB = 25;
/** Sans optimisation possible, seule une vidéo déjà légère est gardée telle quelle. */
export const MAX_UNOPTIMIZED_MB = 15;
/** Au-delà de ce débit moyen (bit/s, son compris), une vidéo déjà en H.264 est ré-encodée. */
export const ALREADY_LIGHT_BITRATE = 2_200_000;

const AVC_CODECS = ['avc1', 'avc3'];

export type VideoPlan = 'keep' | 'remux' | 'transcode';

const isMp4Avc = (info: VideoInspection) =>
  info.container === 'mp4' && !!info.videoCodec && AVC_CODECS.includes(info.videoCodec);

/** Poids en « 10,3 Mo » (virgule, une décimale sous 100 Mo). */
export function formatMo(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const text = mb >= 100 ? String(Math.round(mb)) : mb.toFixed(1).replace('.', ',');
  return `${text} Mo`;
}

/** « 10,3 Mo → 2,1 Mo », affiché au vendeur une fois la vidéo optimisée. */
export function sizeSummary(beforeBytes: number, afterBytes: number): string {
  return `${formatMo(beforeBytes)} → ${formatMo(afterBytes)}`;
}

/** Dimensions de sortie : côté long ≤ 1280, proportions et orientation conservées, valeurs paires. */
export function outputDimensions(width: number, height: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const long = Math.max(width, height);
  if (long <= MAX_VIDEO_LONG_SIDE) return { width: even(width), height: even(height) };
  const scale = MAX_VIDEO_LONG_SIDE / long;
  return { width: even(width * scale), height: even(height * scale) };
}

/**
 * Ce que l'on fait d'une vidéo d'après ses en-têtes :
 * - keep : déjà MP4 H.264, index en tête, légère, ≤ 720p, ≤ 30 s : envoyée telle quelle ;
 * - remux : déjà H.264 léger mais index en fin de fichier (ou .mov) : paquets recopiés
 *   sans ré-encodage dans un MP4 « faststart » (rapide, aucune perte) ;
 * - transcode : tout le reste (HEVC, 1080p/4K, débit élevé, WebM, informations manquantes).
 */
export function planVideo(info: VideoInspection, sizeBytes: number): VideoPlan {
  const duration = info.durationSec;
  const longSide = Math.max(info.width ?? 0, info.height ?? 0);
  const knownLight = !!duration && duration > 0 && longSide > 0
    && longSide <= MAX_VIDEO_LONG_SIDE
    && duration <= MAX_VIDEO_SECONDS
    && (sizeBytes * 8) / duration <= ALREADY_LIGHT_BITRATE;
  if (!knownLight) return 'transcode';
  if (info.videoCodec && AVC_CODECS.includes(info.videoCodec) && (info.container === 'mp4' || info.container === 'quicktime')) {
    return isMp4Avc(info) && info.moovAtStart ? 'keep' : 'remux';
  }
  return 'transcode';
}

/**
 * Repli quand l'appareil ne peut pas optimiser (WebCodecs absent, encodage en échec) :
 * le fichier d'origine n'est gardé que s'il est déjà acceptable pour les clients.
 */
export function isAcceptableAsIs(info: VideoInspection, sizeBytes: number): boolean {
  return isMp4Avc(info)
    && sizeBytes <= MAX_UNOPTIMIZED_MB * 1024 * 1024
    && typeof info.durationSec === 'number'
    && info.durationSec <= MAX_VIDEO_SECONDS;
}

export const MESSAGE_CANNOT_OPTIMIZE = 'Votre appareil ne permet pas d’optimiser cette vidéo : enregistrez-la en 720p ou plus courte, puis ajoutez-la de nouveau.';

export function messageTooLong(durationSec: number): string {
  return `Cette vidéo dure ${Math.ceil(durationSec)} secondes : la durée maximale est de ${MAX_VIDEO_SECONDS} secondes pour qu’elle se charge vite chez vos clients.`;
}

export function messageTooHeavy(afterBytes: number): string {
  return `Même optimisée, la vidéo fait ${formatMo(afterBytes)} (maximum ${MAX_VIDEO_UPLOAD_MB} Mo). Choisissez une vidéo plus courte.`;
}
