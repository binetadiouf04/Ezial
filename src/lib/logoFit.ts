// Cadrage automatique des logos de boutique — code pur (aucun DOM), testé par
// src/lib/logoFit.test.mjs.
//
// Objectif : un logo téléversé s'affiche immédiatement EN ENTIER, centré, sans
// déformation, y compris dans les pastilles RONDES de la marketplace. On repère
// la partie réellement dessinée du logo (ce qui se distingue de son fond), puis
// on la met à l'échelle pour qu'elle tienne dans le cercle inscrit du carré
// final, avec une petite marge. Le fond ajouté autour reprend celui du logo
// (transparent pour un PNG transparent, sa couleur de fond sinon, blanc à défaut).

export interface Rgba { r: number; g: number; b: number; a: number }

export interface LogoAnalysis {
  width: number;
  height: number;
  /** Centre de la partie dessinée, en pixels de l'image source. */
  centerX: number;
  centerY: number;
  /** Distance maximale entre ce centre et un pixel dessiné (pixels source). */
  radius: number;
  /** Fond à utiliser pour les marges : null = transparent. */
  background: Rgba | null;
  /** Le logo a un fond transparent (à conserver : PNG / WebP). */
  transparent: boolean;
}

/** Part du rayon du cercle occupée par le logo (le reste = marge de sécurité). */
export const LOGO_FILL = 0.9;

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };

function colorDistance(a: Rgba, b: Rgba): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function pixel(data: ArrayLike<number>, w: number, x: number, y: number): Rgba {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/** Couleur moyenne d'un petit carré dans un coin de l'image. */
function cornerColor(data: ArrayLike<number>, w: number, h: number, cx: number, cy: number, size: number): Rgba {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let y = cy; y < Math.min(h, cy + size); y++) {
    for (let x = cx; x < Math.min(w, cx + size); x++) {
      const p = pixel(data, w, x, y);
      r += p.r; g += p.g; b += p.b; a += p.a; n++;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n, a: a / n } : WHITE;
}

/**
 * Analyse les pixels RGBA d'un logo (idéalement une version réduite, ~256 px).
 * Le fond est la couleur commune aux quatre coins ; s'ils diffèrent (photo),
 * toute l'image compte comme le logo.
 */
export function analyzeLogo(data: ArrayLike<number>, width: number, height: number): LogoAnalysis {
  const size = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const corners = [
    cornerColor(data, width, height, 0, 0, size),
    cornerColor(data, width, height, width - size, 0, size),
    cornerColor(data, width, height, 0, height - size, size),
    cornerColor(data, width, height, width - size, height - size, size),
  ];
  const transparentCorners = corners.every((c) => c.a < 24);
  const opaqueUniform = corners.every((c) => c.a > 230) && corners.every((c) => colorDistance(c, corners[0]) < 36);
  const bg: Rgba | null = transparentCorners ? null : opaqueUniform
    ? { r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4), g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4), b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4), a: 255 }
    : null;
  const hasUniformBackground = transparentCorners || opaqueUniform;

  // Partie dessinée : pixels qui se distinguent du fond.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const isContent = (p: Rgba) => {
    if (!hasUniformBackground) return true;
    if (transparentCorners) return p.a >= 24;
    return p.a >= 24 && colorDistance(p, bg as Rgba) >= 48;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isContent(pixel(data, width, x, y))) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = width - 1; maxY = height - 1; } // rien de détecté : image entière

  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;
  let radius = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (hasUniformBackground && !isContent(pixel(data, width, x, y))) continue;
      // Coin du pixel le plus éloigné du centre.
      const dx = Math.max(Math.abs(x - centerX), Math.abs(x + 1 - centerX));
      const dy = Math.max(Math.abs(y - centerY), Math.abs(y + 1 - centerY));
      const d = Math.hypot(dx, dy);
      if (d > radius) radius = d;
    }
  }
  return {
    width, height, centerX, centerY,
    radius: Math.max(radius, 1),
    background: transparentCorners ? null : (bg ?? WHITE),
    transparent: transparentCorners,
  };
}

export interface LogoAdjust { zoom: number; offsetX: number; offsetY: number }
export const DEFAULT_ADJUST: LogoAdjust = { zoom: 1, offsetX: 0, offsetY: 0 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

/**
 * Où dessiner l'image source dans un carré de côté `side` : la partie dessinée
 * tient dans le cercle inscrit (zoom 1), centrée ; l'ajustement manuel
 * (zoom, déplacement en fraction du côté) s'applique par-dessus.
 * Les proportions sont toujours conservées (même échelle en largeur et hauteur).
 */
export function placeLogo(a: LogoAnalysis, side: number, adjust: LogoAdjust = DEFAULT_ADJUST) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, adjust.zoom));
  const scale = ((side / 2) * LOGO_FILL / a.radius) * zoom;
  const x = side / 2 + adjust.offsetX * side - a.centerX * scale;
  const y = side / 2 + adjust.offsetY * side - a.centerY * scale;
  return { x, y, width: a.width * scale, height: a.height * scale, scale };
}

/** Côté du fichier enregistré : assez grand pour ne pas perdre de détail, 512 px au plus (limite actuelle des logos). */
export function outputSide(a: LogoAnalysis, sourceScale: number, max = 512, min = 256): number {
  // sourceScale : rapport entre l'image analysée (réduite) et l'original.
  const needed = Math.ceil((2 * a.radius * sourceScale) / LOGO_FILL);
  return Math.max(min, Math.min(max, needed));
}
