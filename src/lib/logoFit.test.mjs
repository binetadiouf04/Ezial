// Tests du cadrage automatique des logos (code pur, images synthétiques).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLogo, placeLogo, LOGO_FILL, DEFAULT_ADJUST, outputSide } from './logoFit.ts';

// Image RGBA remplie d'une couleur, avec une fonction de dessin facultative.
function image(w, h, bg, draw) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = (draw && draw(x, y)) || bg;
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
  }
  return data;
}
const WHITE = [255, 255, 255, 255], BLACK = [20, 20, 20, 255], CLEAR = [0, 0, 0, 0], RED = [140, 16, 36, 255];

// Tous les coins de la partie dessinée doivent tomber dans le cercle inscrit du carré final.
function fitsInCircle(a, side, adjust = DEFAULT_ADJUST, contentBox) {
  const p = placeLogo(a, side, adjust);
  const [x0, y0, x1, y1] = contentBox;
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [p.x + x * p.scale, p.y + y * p.scale]);
  return pts.every(([x, y]) => Math.hypot(x - side / 2, y - side / 2) <= side / 2 + 0.01);
}

test('logo rectangulaire (texte large sur fond blanc) : entier, centré, dans le cercle', () => {
  // 200 x 80, texte noir de x 20..180, y 30..50
  const d = image(200, 80, WHITE, (x, y) => (x >= 20 && x < 180 && y >= 30 && y < 50 ? BLACK : null));
  const a = analyzeLogo(d, 200, 80);
  assert.deepEqual([a.centerX, a.centerY], [100, 40]);
  assert.equal(a.transparent, false);
  assert.ok(a.background && a.background.r > 250, 'fond blanc repris pour les marges');
  assert.ok(fitsInCircle(a, 512, DEFAULT_ADJUST, [20, 30, 180, 50]));
  const p = placeLogo(a, 512);
  // centré : le centre du texte tombe au centre du carré
  assert.ok(Math.abs(p.x + 100 * p.scale - 256) < 0.01 && Math.abs(p.y + 40 * p.scale - 256) < 0.01);
  // proportions conservées
  assert.ok(Math.abs(p.width / p.height - 200 / 80) < 1e-9);
});

test('logo rond sur fond transparent : remplit le cercle (avec marge), fond transparent conservé', () => {
  const d = image(120, 120, CLEAR, (x, y) => (Math.hypot(x + 0.5 - 60, y + 0.5 - 60) <= 55 ? RED : null));
  const a = analyzeLogo(d, 120, 120);
  assert.equal(a.transparent, true);
  assert.equal(a.background, null);
  const p = placeLogo(a, 512);
  const drawnRadius = 55 * p.scale;
  assert.ok(drawnRadius <= 256 && drawnRadius > 256 * (LOGO_FILL - 0.05), `rayon dessiné ${drawnRadius}`);
});

test('logo carré plein (photo, coins différents) : image entière, aucun coin coupé par le cercle', () => {
  const d = image(100, 100, WHITE, (x, y) => [x * 2, y * 2, 100, 255]);
  const a = analyzeLogo(d, 100, 100);
  assert.ok(fitsInCircle(a, 512, DEFAULT_ADJUST, [0, 0, 100, 100]));
});

test('logo haut et étroit : entier et centré', () => {
  const d = image(60, 240, WHITE, (x, y) => (x >= 10 && x < 50 && y >= 10 && y < 230 ? RED : null));
  const a = analyzeLogo(d, 60, 240);
  assert.ok(fitsInCircle(a, 300, DEFAULT_ADJUST, [10, 10, 50, 230]));
});

test('ajustement manuel : zoom et déplacement s’appliquent, réinitialiser = cadrage automatique', () => {
  const d = image(200, 80, WHITE, (x, y) => (x >= 20 && x < 180 && y >= 30 && y < 50 ? BLACK : null));
  const a = analyzeLogo(d, 200, 80);
  const auto = placeLogo(a, 512);
  const zoomed = placeLogo(a, 512, { zoom: 2, offsetX: 0.1, offsetY: 0 });
  assert.ok(Math.abs(zoomed.scale - auto.scale * 2) < 1e-9);
  assert.ok(Math.abs((zoomed.x + 100 * zoomed.scale) - (256 + 51.2)) < 0.01);
  assert.deepEqual(placeLogo(a, 512, DEFAULT_ADJUST), auto);
  // zoom borné (0,5 à 3)
  assert.ok(Math.abs(placeLogo(a, 512, { zoom: 10, offsetX: 0, offsetY: 0 }).scale - auto.scale * 3) < 1e-9);
});

test('taille du fichier enregistré : entre 256 et 512 px', () => {
  const small = analyzeLogo(image(40, 40, WHITE, (x, y) => (x > 5 && x < 35 && y > 5 && y < 35 ? BLACK : null)), 40, 40);
  assert.equal(outputSide(small, 1), 256);
  const big = analyzeLogo(image(200, 80, WHITE, (x, y) => (x >= 20 && x < 180 && y >= 30 && y < 50 ? BLACK : null)), 200, 80);
  assert.equal(outputSide(big, 10), 512);
});
