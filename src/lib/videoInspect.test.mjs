import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectVideo, judgeVideo } from './videoInspect.ts';

// Fabrique de boîtes ISO BMFF minimales (mêmes dispositions que les fichiers
// produits par un iPhone ou ffmpeg, vérifiées avec ffprobe le 24 nov. 2026).
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const box = (type, ...children) => { const body = children.flat(); return [...u32(8 + body.length), ...ascii(type), ...body]; };
const ftyp = (brand) => box('ftyp', ascii(brand), u32(0));
const mvhd = (timescale, duration) => box('mvhd', [0, 0, 0, 0], u32(0), u32(0), u32(timescale), u32(duration), new Array(80).fill(0));
const hdlr = (handler) => box('hdlr', [0, 0, 0, 0], u32(0), ascii(handler), new Array(12).fill(0), [0]);
const visualEntry = (codec, w, h) => box(codec, new Array(6).fill(0), u16(1), new Array(16).fill(0), u16(w), u16(h), new Array(50).fill(0));
const stsd = (entry) => box('stsd', [0, 0, 0, 0], u32(1), entry);
const trak = (handler, entry, extraMinf = []) => box('trak', box('mdia', hdlr(handler), box('minf', extraMinf, box('stbl', stsd(entry)))));
const mdat = (n) => box('mdat', new Array(n).fill(7));

const inspect = async (bytes) => { const b = Uint8Array.from(bytes); return inspectVideo(async (s, e) => b.subarray(s, e), b.length); };

test('MP4 H.264 + AAC, index en tête (faststart)', async () => {
  const moov = box('moov', mvhd(1000, 12500), trak('vide', visualEntry('avc1', 1080, 1920)), trak('soun', box('mp4a', new Array(28).fill(0))));
  const info = await inspect([...ftyp('isom'), ...moov, ...mdat(64)]);
  assert.equal(info.container, 'mp4');
  assert.equal(info.videoCodec, 'avc1');
  assert.equal(info.audioCodec, 'mp4a');
  assert.equal(info.moovAtStart, true);
  assert.equal(info.durationSec, 12.5);
  assert.deepEqual([info.width, info.height], [1080, 1920]);
  assert.deepEqual(judgeVideo(info, 5 * 1024 * 1024), { warnings: [] });
});

test('MOV HEVC de l’iPhone (index en fin, hdlr « alis » dans minf) : refusé avec un message clair', async () => {
  const moov = box('moov', mvhd(600, 600), trak('vide', visualEntry('hvc1', 1920, 1080), hdlr('alis')));
  const info = await inspect([...ftyp('qt  '), ...mdat(64), ...moov]);
  assert.equal(info.container, 'quicktime');
  assert.equal(info.videoCodec, 'hvc1');
  assert.equal(info.moovAtStart, false);
  const verdict = judgeVideo(info, 10 * 1024 * 1024);
  assert.match(verdict.error ?? '', /HEVC/);
  assert.match(verdict.error ?? '', /Le plus compatible/);
});

test('MOV H.264 accepté ; 4K et poids élevé seulement signalés', async () => {
  const moov = box('moov', mvhd(600, 600), trak('vide', visualEntry('avc1', 3840, 2160)));
  const info = await inspect([...ftyp('qt  '), ...moov, ...mdat(16)]);
  const verdict = judgeVideo(info, 30 * 1024 * 1024);
  assert.equal(verdict.error, undefined);
  assert.equal(verdict.warnings.length, 2);
});

test('WebM reconnu par sa signature : avertissement iPhone ancien', async () => {
  const info = await inspect([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0]);
  assert.equal(info.container, 'webm');
  assert.equal(judgeVideo(info, 1024).warnings.length, 1);
});

test('fichier tronqué ou inconnu : aucune exception, rien de bloquant', async () => {
  const info = await inspect([0, 0, 0, 40, ...ascii('ftyp'), ...ascii('mp42')]);
  assert.equal(info.container, 'mp4');
  assert.equal(info.videoCodec, undefined);
  assert.equal(judgeVideo(info, 1024).error, undefined);
  const garbage = await inspect([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(garbage.container, 'unknown');
});
