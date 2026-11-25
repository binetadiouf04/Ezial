import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planVideo, isAcceptableAsIs, outputDimensions, formatMo, sizeSummary,
  MAX_VIDEO_SECONDS, MAX_VIDEO_UPLOAD_MB, MAX_UNOPTIMIZED_MB, messageTooLong, messageTooHeavy,
} from './videoOptimizeCore.ts';

const MB = 1024 * 1024;
const mp4 = (over = {}) => ({ container: 'mp4', brand: 'isom', videoCodec: 'avc1', moovAtStart: true, durationSec: 10, width: 1280, height: 720, ...over });

test('dimensions : côté long ≤ 1280, orientation et proportions conservées, valeurs paires', () => {
  assert.deepEqual(outputDimensions(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(outputDimensions(1080, 1920), { width: 720, height: 1280 });
  assert.deepEqual(outputDimensions(3840, 2160), { width: 1280, height: 720 });
  assert.deepEqual(outputDimensions(640, 480), { width: 640, height: 480 });
  const odd = outputDimensions(1919, 1079);
  assert.ok(odd.width % 2 === 0 && odd.height % 2 === 0 && Math.max(odd.width, odd.height) <= 1280);
});

test('plan : MP4 H.264 léger avec index en tête = envoyé tel quel', () => {
  assert.equal(planVideo(mp4(), 1.5 * MB), 'keep');
});

test('plan : H.264 léger mais index en fin de fichier ou .mov = recopie sans ré-encodage', () => {
  assert.equal(planVideo(mp4({ moovAtStart: false }), 1.5 * MB), 'remux');
  assert.equal(planVideo(mp4({ container: 'quicktime', brand: 'qt  ' }), 1.5 * MB), 'remux');
});

test('plan : HEVC, 1080p, 4K, débit élevé, WebM, durée inconnue ou trop longue = ré-encodage', () => {
  assert.equal(planVideo(mp4({ videoCodec: 'hvc1', container: 'quicktime' }), 5 * MB), 'transcode');
  assert.equal(planVideo(mp4({ width: 1920, height: 1080 }), 1.5 * MB), 'transcode');
  assert.equal(planVideo(mp4({ width: 3840, height: 2160 }), 1.5 * MB), 'transcode');
  assert.equal(planVideo(mp4(), 10.3 * MB), 'transcode'); // 10 s, ~8,6 Mbit/s
  assert.equal(planVideo({ container: 'webm' }, MB), 'transcode');
  assert.equal(planVideo(mp4({ durationSec: undefined }), MB), 'transcode');
  assert.equal(planVideo(mp4({ durationSec: 45 }), 2 * MB), 'transcode');
});

test('repli sans optimisation : seulement MP4 H.264, ≤ 15 Mo, ≤ 30 s', () => {
  assert.equal(isAcceptableAsIs(mp4(), 10 * MB), true);
  assert.equal(isAcceptableAsIs(mp4(), (MAX_UNOPTIMIZED_MB + 1) * MB), false);
  assert.equal(isAcceptableAsIs(mp4({ durationSec: 31 }), MB), false);
  assert.equal(isAcceptableAsIs(mp4({ durationSec: undefined }), MB), false);
  assert.equal(isAcceptableAsIs(mp4({ videoCodec: 'hvc1' }), MB), false);
  assert.equal(isAcceptableAsIs(mp4({ container: 'quicktime' }), MB), false);
  assert.equal(isAcceptableAsIs({ container: 'webm' }, MB), false);
});

test('textes en français : poids, résumé avant/après, durée, plafond', () => {
  assert.equal(formatMo(10314679), '9,8 Mo');
  assert.equal(sizeSummary(10.3 * MB, 2.1 * MB), '10,3 Mo → 2,1 Mo');
  assert.match(messageTooLong(47.2), /48 secondes.*30 secondes/);
  assert.match(messageTooHeavy(26 * MB), /26,0 Mo.*25 Mo/);
  assert.equal(MAX_VIDEO_SECONDS, 30);
  assert.equal(MAX_VIDEO_UPLOAD_MB, 25);
});
