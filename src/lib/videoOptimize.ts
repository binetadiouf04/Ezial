// Optimisation d'une vidéo produit dans le navigateur du vendeur, AVANT l'envoi :
// MP4 H.264 (+ AAC), 720p maximum, ~1,5 Mbit/s, 30 i/s maximum, 30 s maximum,
// index « moov » en tête (lecture immédiate), plus une image de couverture.
//
// Le transcodage utilise WebCodecs (encodeur/décodeur matériels de l'appareil)
// et la bibliothèque mediabunny. Elle n'est chargée par import() dynamique QUE
// quand un vendeur choisit une vidéo : jamais dans le bundle principal, jamais
// côté acheteur.

import { inspectVideoFile, judgeVideo, type VideoInspection } from './videoInspect';
import { encodeCanvasForWeb } from '@/utils/imageOptimize';
import {
  MAX_VIDEO_SECONDS, TARGET_VIDEO_BITRATE, MAX_VIDEO_FPS, MAX_VIDEO_UPLOAD_MB,
  planVideo, isAcceptableAsIs, outputDimensions, messageTooLong, messageTooHeavy, MESSAGE_CANNOT_OPTIMIZE,
  type VideoPlan,
} from './videoOptimizeCore';

export type VideoOptimizeFailure = 'too_long' | 'too_heavy' | 'cannot_optimize' | 'hevc' | 'canceled';

export class VideoOptimizeError extends Error {
  constructor(readonly code: VideoOptimizeFailure, message: string, readonly durationSec?: number) {
    super(message);
  }
}

export interface OptimizedVideo {
  /** MP4 prêt à envoyer (le fichier d'origine si déjà acceptable). */
  file: File;
  /** Image de couverture (~720 px, WebP ou JPEG), null si elle n'a pu être extraite. */
  cover: File | null;
  beforeBytes: number;
  afterBytes: number;
  plan: VideoPlan;
  /** Le son d'origine n'a pas pu être conservé sur cet appareil. */
  audioDropped: boolean;
  /** Repli : fichier d'origine gardé car l'optimisation était impossible mais il est déjà acceptable. */
  keptOriginal: boolean;
}

export interface OptimizeOptions {
  signal?: AbortSignal;
  /** 0 à 1. */
  onProgress?: (fraction: number) => void;
  /** Le vendeur a accepté de ne garder que les 30 premières secondes. */
  trimToLimit?: boolean;
}

const COVER_WIDTH = 720;

/** WebCodecs vidéo disponible (Safari iOS ≥ 16.4, Chrome Android, Chrome/Edge de bureau). */
export function canOptimizeVideos(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

const mp4Name = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'video'}.mp4`;

type Mediabunny = typeof import('mediabunny');

async function extractCover(mb: Mediabunny, input: InstanceType<Mediabunny['Input']>, durationSec: number): Promise<File | null> {
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const displayWidth = await track.getDisplayWidth();
    const sink = new mb.CanvasSink(track, { width: Math.min(COVER_WIDTH, displayWidth), fit: 'contain' });
    // Un peu après le début : la toute première image d'un film d'iPhone est
    // souvent floue ou noire (mise au point, exposition).
    const start = await track.getFirstTimestamp();
    const at = start + Math.min(0.5, Math.max(0, durationSec / 4));
    const wrapped = (await sink.getCanvas(at)) ?? (await sink.getCanvas(start));
    if (!wrapped) return null;
    const source = wrapped.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source as CanvasImageSource, 0, 0);
    const encoded = await encodeCanvasForWeb(canvas, 0.8);
    canvas.width = 0;
    canvas.height = 0;
    if (!encoded) return null;
    return new File([encoded.blob], `couverture.${encoded.ext}`, { type: encoded.type });
  } catch {
    return null;
  }
}

async function runConversion(file: File, plan: VideoPlan, opts: OptimizeOptions): Promise<OptimizedVideo> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: [mb.MP4, mb.QTFF, mb.WEBM] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoOptimizeError('cannot_optimize', MESSAGE_CANNOT_OPTIMIZE);
    const durationSec = await input.computeDuration();
    if (durationSec > MAX_VIDEO_SECONDS + 0.5 && !opts.trimToLimit) {
      throw new VideoOptimizeError('too_long', messageTooLong(durationSec), durationSec);
    }
    const effectiveDuration = Math.min(durationSec, MAX_VIDEO_SECONDS);
    const cover = await extractCover(mb, input, effectiveDuration);

    const dims = outputDimensions(await track.getDisplayWidth(), await track.getDisplayHeight());
    let fps = 0;
    try { fps = (await track.computePacketStats(120)).averagePacketRate; } catch { /* inconnu : plafonné par sécurité */ }
    const hasAudio = (await input.getPrimaryAudioTrack()) !== null;

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const transcode = plan === 'transcode';
    const conversion = await mb.Conversion.init({
      input,
      output,
      showWarnings: false,
      trim: durationSec > MAX_VIDEO_SECONDS ? { start: 0, end: MAX_VIDEO_SECONDS } : undefined,
      tags: {},
      video: transcode
        ? {
            codec: 'avc',
            width: dims.width,
            height: dims.height,
            fit: 'contain' as const,
            quality: new mb.Quality({ bitrate: TARGET_VIDEO_BITRATE }),
            keyFrameInterval: 2,
            forceTranscode: true,
            ...(fps === 0 || fps > MAX_VIDEO_FPS + 0.5 ? { frameRate: MAX_VIDEO_FPS } : {}),
          }
        : { codec: 'avc' },
      // Son AAC recopié tel quel quand c'est possible ; sinon ré-encodé en AAC si l'appareil sait le faire.
      audio: { codec: 'aac' },
    });
    // Sans piste vidéo utilisable (codec que l'appareil ne sait pas décoder, ex. HEVC sur Chrome),
    // la conversion resterait « valide » avec le seul son : c'est un échec.
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) throw new VideoOptimizeError('cannot_optimize', MESSAGE_CANNOT_OPTIMIZE);

    const onAbort = () => { void conversion.cancel(); };
    if (opts.signal?.aborted) throw new VideoOptimizeError('canceled', 'Optimisation annulée.');
    opts.signal?.addEventListener('abort', onAbort);
    conversion.onProgress = (p) => opts.onProgress?.(Math.max(0, Math.min(1, p)));
    try {
      await conversion.execute();
    } catch (err) {
      if (err instanceof mb.ConversionCanceledError || opts.signal?.aborted) throw new VideoOptimizeError('canceled', 'Optimisation annulée.');
      throw err;
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }

    const audioDropped = hasAudio && !conversion.utilizedTracks.some((t) => t.isAudioTrack());
    const buffer = (output.target as InstanceType<Mediabunny['BufferTarget']>).buffer;
    if (!buffer || buffer.byteLength === 0) throw new VideoOptimizeError('cannot_optimize', MESSAGE_CANNOT_OPTIMIZE);
    const result = new File([buffer], mp4Name(file.name), { type: 'video/mp4' });
    // Jamais plus lourd que l'original quand celui-ci était déjà léger.
    if (!transcode && result.size > file.size * 1.05) throw new VideoOptimizeError('cannot_optimize', MESSAGE_CANNOT_OPTIMIZE);
    if (result.size > MAX_VIDEO_UPLOAD_MB * 1024 * 1024) throw new VideoOptimizeError('too_heavy', messageTooHeavy(result.size));
    return { file: result, cover, beforeBytes: file.size, afterBytes: result.size, plan, audioDropped, keptOriginal: false };
  } finally {
    input.dispose();
  }
}

/** Couverture seule, pour une vidéo gardée telle quelle (déjà légère, index en tête). */
async function coverOnly(file: File): Promise<File | null> {
  if (!canOptimizeVideos()) return null;
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: [mb.MP4, mb.QTFF, mb.WEBM] });
    try {
      return await extractCover(mb, input, await input.computeDuration());
    } finally {
      input.dispose();
    }
  } catch {
    return null;
  }
}

/**
 * Prépare la vidéo choisie par le vendeur. Lance VideoOptimizeError avec un message
 * clair en français quand la vidéo ne peut pas être acceptée.
 */
export async function optimizeVideo(file: File, opts: OptimizeOptions = {}): Promise<OptimizedVideo> {
  const info = await inspectVideoFile(file).catch((): VideoInspection => ({ container: 'unknown' }));
  const knownTooLong = typeof info.durationSec === 'number' && info.durationSec > MAX_VIDEO_SECONDS + 0.5;
  if (knownTooLong && !opts.trimToLimit && !canOptimizeVideos()) {
    throw new VideoOptimizeError('too_long', messageTooLong(info.durationSec as number), info.durationSec);
  }
  const plan: VideoPlan = knownTooLong ? 'transcode' : planVideo(info, file.size);

  if (plan === 'keep') {
    // Rien à ré-encoder : on envoie le fichier tel quel, avec sa couverture.
    return { file, cover: await coverOnly(file), beforeBytes: file.size, afterBytes: file.size, plan, audioDropped: false, keptOriginal: false };
  }

  if (canOptimizeVideos()) {
    try {
      return await runConversion(file, plan, opts);
    } catch (err) {
      if (err instanceof VideoOptimizeError && err.code !== 'cannot_optimize') throw err;
      // Échec de l'encodage sur cet appareil : repli ci-dessous.
      console.warn('[vidéo] optimisation impossible sur cet appareil', err);
    }
  }
  if (knownTooLong) throw new VideoOptimizeError('too_long', messageTooLong(info.durationSec as number), info.durationSec);
  if (isAcceptableAsIs(info, file.size)) {
    return { file, cover: await coverOnly(file), beforeBytes: file.size, afterBytes: file.size, plan: 'keep', audioDropped: false, keptOriginal: true };
  }
  const verdict = judgeVideo(info, file.size);
  if (verdict.error) throw new VideoOptimizeError('hevc', verdict.error);
  throw new VideoOptimizeError('cannot_optimize', MESSAGE_CANNOT_OPTIMIZE);
}
