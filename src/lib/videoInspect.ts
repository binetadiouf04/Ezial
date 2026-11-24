// Lecture des en-têtes d'une vidéo AVANT son envoi (aucune dépendance, aucun
// décodage) : conteneur, codec vidéo, position de l'atome « moov » (index de
// lecture), durée et dimensions. Sert à refuser, avec un message clair, une
// vidéo que la plupart des acheteurs ne pourraient pas lire (HEVC), et à
// prévenir quand une vidéo sera lente à charger.
//
// MP4 / MOV (ISO BMFF) : suite de boîtes [taille sur 4 octets][type sur 4]
// (taille 1 = taille réelle sur 8 octets ensuite ; taille 0 = jusqu'à la fin).
// Seules les boîtes de premier niveau et l'intérieur de « moov » sont lus :
// le flux média (« mdat », l'essentiel du poids) n'est jamais chargé.

export type ReadRange = (start: number, end: number) => Promise<Uint8Array>;

export interface VideoInspection {
  container: 'mp4' | 'quicktime' | 'webm' | 'unknown';
  /** Marque principale de la boîte ftyp (isom, mp42, qt  ...). */
  brand?: string;
  /** Code du codec vidéo (avc1/avc3 = H.264, hvc1/hev1 = HEVC/H.265...). */
  videoCodec?: string;
  audioCodec?: string;
  /** true : l'index (moov) précède les données (« faststart »), la lecture démarre sans attendre la fin du fichier. */
  moovAtStart?: boolean;
  durationSec?: number;
  width?: number;
  height?: number;
}

const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);

interface TrackInfo { handler?: string; codec?: string; width?: number; height?: number }

// Parcourt l'intérieur de moov (déjà en mémoire) et remplit `out`.
function walkMoov(b: Uint8Array, start: number, end: number, out: VideoInspection, track: TrackInfo | null, tracks: TrackInfo[]): void {
  let pos = start;
  while (pos + 8 <= end) {
    let size = u32(b, pos);
    const type = fourcc(b, pos + 4);
    let header = 8;
    if (size === 1) { if (pos + 16 > end) return; size = u64(b, pos + 8); header = 16; }
    else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return;
    const body = pos + header;
    const boxEnd = pos + size;

    if (type === 'trak') {
      const t: TrackInfo = {};
      tracks.push(t);
      walkMoov(b, body, boxEnd, out, t, tracks);
    } else if (CONTAINER_BOXES.has(type)) {
      walkMoov(b, body, boxEnd, out, track, tracks);
    } else if (type === 'mvhd' && body + 20 <= boxEnd) {
      const version = b[body];
      const timescale = version === 1 ? u32(b, body + 20) : u32(b, body + 12);
      const duration = version === 1 ? u64(b, body + 24) : u32(b, body + 16);
      if (timescale > 0) out.durationSec = Math.round((duration / timescale) * 10) / 10;
    } else if (type === 'hdlr' && track && !track.handler && body + 12 <= boxEnd) {
      // Le 1er hdlr (celui de mdia) donne le type de piste ; dans un .mov, un 2e
      // hdlr dans minf (« alis », « url ») décrit seulement la référence des données.
      track.handler = fourcc(b, body + 8);
    } else if (type === 'stsd' && track && body + 16 <= boxEnd) {
      // version/flags (4) + nombre d'entrées (4), puis la 1re entrée : taille (4) + codec (4).
      const entry = body + 8;
      track.codec = fourcc(b, entry + 4);
      // Entrée visuelle : 8 (en-tête) + 8 (réservé, index) + 16 (prédéfini) puis largeur, hauteur.
      if (entry + 36 <= boxEnd) { track.width = u16(b, entry + 32); track.height = u16(b, entry + 34); }
    }
    pos = boxEnd;
  }
}

export async function inspectVideo(read: ReadRange, size: number): Promise<VideoInspection> {
  const out: VideoInspection = { container: 'unknown' };
  if (size < 8) return out;
  const head = await read(0, Math.min(size, 16));
  // WebM / Matroska : signature EBML 1A 45 DF A3.
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { container: 'webm' };

  let pos = 0;
  let moovPos = -1;
  let mdatPos = -1;
  let moovSize = 0;
  for (let guard = 0; pos + 8 <= size && guard < 64; guard++) {
    const h = await read(pos, Math.min(size, pos + 16));
    if (h.length < 8) break;
    let boxSize = u32(h, 0);
    const type = fourcc(h, 4);
    if (boxSize === 1) { if (h.length < 16) break; boxSize = u64(h, 8); }
    else if (boxSize === 0) boxSize = size - pos;
    if (boxSize < 8) break;
    if (type === 'ftyp' && h.length >= 12) {
      out.brand = fourcc(h, 8);
      out.container = out.brand === 'qt  ' ? 'quicktime' : 'mp4';
    } else if (type === 'moov' && moovPos < 0) { moovPos = pos; moovSize = boxSize; }
    else if (type === 'mdat' && mdatPos < 0) mdatPos = pos;
    pos += boxSize;
  }
  if (out.container === 'unknown' && moovPos >= 0) out.container = 'quicktime'; // ancien .mov sans ftyp
  if (moovPos >= 0) {
    if (mdatPos >= 0) out.moovAtStart = moovPos < mdatPos;
    if (moovSize <= MAX_MOOV_BYTES) {
      const moov = await read(moovPos, Math.min(size, moovPos + moovSize));
      const tracks: TrackInfo[] = [];
      walkMoov(moov, 8, moov.length, out, null, tracks);
      const video = tracks.find((t) => t.handler === 'vide');
      const audio = tracks.find((t) => t.handler === 'soun');
      if (video) { out.videoCodec = video.codec; out.width = video.width; out.height = video.height; }
      if (audio) out.audioCodec = audio.codec;
    }
  }
  return out;
}

/** Lecture d'un fichier choisi par le vendeur, par morceaux (jamais le fichier entier en mémoire). */
export function inspectVideoFile(file: Blob): Promise<VideoInspection> {
  return inspectVideo(async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()), file.size);
}

export const HEVC_CODECS = ['hvc1', 'hev1'];
/** Au-delà, la vidéo est acceptée mais le vendeur est prévenu qu'elle sera lente en 3G/4G. */
export const HEAVY_VIDEO_MB = 20;

export interface VideoVerdict {
  /** Message bloquant : la vidéo n'est pas ajoutée. */
  error?: string;
  /** Messages d'avertissement : la vidéo est ajoutée. */
  warnings: string[];
}

// Règles d'acceptation, en français, pour le formulaire produit.
export function judgeVideo(info: VideoInspection, sizeBytes: number): VideoVerdict {
  const warnings: string[] = [];
  if (info.videoCodec && HEVC_CODECS.includes(info.videoCodec)) {
    return {
      error: 'Cette vidéo est enregistrée en HEVC (format « Haute efficacité » de l’iPhone) : beaucoup de téléphones Android et d’ordinateurs ne peuvent pas la lire. '
        + 'Sur iPhone, choisissez Réglages > Appareil photo > Formats > « Le plus compatible », filmez à nouveau puis ajoutez la nouvelle vidéo.',
      warnings,
    };
  }
  if (info.container === 'webm') warnings.push('Les vidéos WebM ne sont pas lues par certains iPhone et iPad anciens : préférez une vidéo MP4.');
  const longSide = Math.max(info.width ?? 0, info.height ?? 0);
  if (longSide > 1920) warnings.push('Vidéo en 4K : elle sera lourde à charger pour vos clients. Filmez plutôt en 1080p.');
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb > HEAVY_VIDEO_MB) warnings.push(`La vidéo fait ${Math.ceil(sizeMb)} Mo : elle chargera lentement sur une connexion mobile. Une vidéo courte (15 à 30 secondes) est idéale.`);
  return { warnings };
}
