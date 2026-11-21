#!/usr/bin/env python3
"""Icônes de l'application Ezial Livreur (livreur.ezial.net), à partir de l'image fournie
par la propriétaire le 21 nov. 2026 : docs/identite/icone-livreur-source.png (carré arrondi
rouge, livreur à scooter crème, sans texte, sans papillon).

Le dessin, les couleurs et les proportions de l'image ne sont jamais modifiés. Seul le
pourtour change selon ce que chaque système exige :
  - icon-192.png / icon-512.png (« any », Android) : le carré arrondi seul, coins transparents ;
  - apple-touch-icon.png (180, iPhone) : iOS refuse la transparence (coins noirs) et arrondit
    lui-même : les coins blancs de l'image sont remplis en prolongeant le rouge du bord ;
  - icon-maskable-512.png (Android adaptatif) : même carré plein, réduit pour que tout le
    pictogramme (traits de vitesse compris) reste dans le cercle sûr (rayon 40 %), sur un
    fond qui prolonge le rouge du bord.

Utilisation : python3 scripts/generate-livreur-icons.py   (numpy + Pillow)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / 'identite' / 'icone-livreur-source.png'
OUT = ROOT / 'public' / 'icons' / 'livreur'
SAFE_RADIUS = 0.40   # zone sûre d'une icône adaptative (cercle de 80 % du côté)
SAFE_MARGIN = 0.97   # petite marge supplémentaire sous la limite


def outside_mask(rgb):
    """Fond blanc autour du carré arrondi : pixels clairs reliés aux bords de l'image
    (le pictogramme crème, à l'intérieur, n'est jamais touché)."""
    light = (rgb.min(axis=2) > 200).astype(np.uint8) * 255
    img = Image.fromarray(light, 'L').copy()  # copie : une image liée au tableau numpy ne se remplit pas
    h, w = light.shape
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if img.getpixel(seed) == 255:
            ImageDraw.floodfill(img, seed, 128)
    return np.asarray(img) == 128


def with_alpha(rgb):
    """Carré arrondi détouré : transparence calculée sur le liseré (mélange blanc / rouge)."""
    out = outside_mask(rgb)
    # Liseré : pixels voisins du fond blanc ; alpha d'après la part de rouge (canal vert).
    near = np.zeros_like(out)
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            near |= np.roll(np.roll(out, dy, 0), dx, 1)
    alpha = np.where(out, 0.0, 1.0)
    edge = near & ~out
    g = rgb[..., 1].astype(np.float64)
    alpha[edge] = np.clip((255 - g[edge]) / 250, 0, 1)
    a = alpha[..., None]
    color = np.where(a > 0.02, (rgb - (1 - a) * 255) / np.maximum(a, 1e-6), rgb)
    rgba = np.dstack([np.clip(color, 0, 255), alpha * 255]).round().astype(np.uint8)
    ys, xs = np.where(alpha > 0.5)
    return Image.fromarray(rgba, 'RGBA'), (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def radial_fill(tile, scale=1.0):
    """Carré plein de la taille de `tile` : le carré arrondi, réduit de `scale` et centré,
    sur un fond qui prolonge son rouge dans l'axe du centre (chaque pixel du pourtour reprend
    la couleur du bord du carré dans la même direction). Le dégradé de l'image étant
    circulaire, le prolongement reste continu, sans trait ni coin blanc."""
    from PIL import ImageFilter
    arr = np.asarray(tile).astype(np.float64)
    side = arr.shape[0]
    c = (side - 1) / 2
    alpha = arr[..., 3] / 255
    # Rouge franc seulement : pixels opaques à au moins 6 px du liseré (aucun mélange avec le
    # blanc du fond d'origine), adoucis entre eux (moyenne pondérée, sans grain).
    solid = alpha >= 0.98
    for _ in range(6):
        solid = solid & np.roll(solid, 1, 0) & np.roll(solid, -1, 0) & np.roll(solid, 1, 1) & np.roll(solid, -1, 1)
    mask = Image.fromarray((solid * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(3))
    weighted = Image.fromarray((arr[..., :3] * solid[..., None]).round().astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(3))
    m = np.asarray(mask).astype(np.float64)[..., None] / 255
    soft = np.asarray(weighted).astype(np.float64) / np.maximum(m, 1e-3)
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float64)
    vx, vy = c + (xx - c) / scale, c + (yy - c) / scale
    background = np.zeros((side, side, 3))
    todo = np.ones((side, side), dtype=bool)
    for t in np.linspace(1.0, 0.3, 700):
        qx = np.clip(np.round(c + (vx - c) * t), 0, side - 1).astype(int)
        qy = np.clip(np.round(c + (vy - c) * t), 0, side - 1).astype(int)
        hit = todo & solid[qy, qx]
        background[hit] = soft[qy[hit], qx[hit]]
        todo &= ~hit
        if not todo.any():
            break
    canvas = Image.fromarray(background.round().astype(np.uint8), 'RGB').convert('RGBA')
    size = round(side * scale)
    inner = tile.resize((size, size), Image.LANCZOS) if size != side else tile
    off = (side - size) // 2
    canvas.alpha_composite(inner, (off, off))
    return canvas.convert('RGB')


def pictogram_radius(full_rgb):
    """Rayon (part du côté) du point crème le plus éloigné du centre."""
    arr = np.asarray(full_rgb).astype(np.int32)
    cream = (arr.min(axis=2) > 200)
    ys, xs = np.where(cream)
    side = arr.shape[0]
    c = (side - 1) / 2
    return float(np.sqrt((xs - c) ** 2 + (ys - c) ** 2).max() / side)


def save(img, name, size):
    path = OUT / name
    img.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
    print(f'{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size} octets')


def main():
    rgb = np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float64)
    rgba, (x0, y0, x1, y1) = with_alpha(rgb)
    # Carré englobant le carré arrondi (centré), sans le fond blanc autour.
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = (round(cx - side / 2), round(cy - side / 2), round(cx - side / 2) + side, round(cy - side / 2) + side)
    tile = rgba.crop(box)
    print(f'carré arrondi : {x1 - x0}x{y1 - y0} px dans une image {rgb.shape[1]}x{rgb.shape[0]}')

    OUT.mkdir(parents=True, exist_ok=True)
    save(tile, 'icon-192.png', 192)
    save(tile, 'icon-512.png', 512)

    full = radial_fill(tile)
    save(full, 'apple-touch-icon.png', 180)

    r = pictogram_radius(full)
    scale = min(1.0, SAFE_RADIUS * SAFE_MARGIN / r)
    print(f'pictogramme : rayon {r:.3f} du côté -> réduction {scale:.3f} pour la zone sûre ({SAFE_RADIUS})')
    canvas = radial_fill(tile, scale)
    print(f'pictogramme adaptatif : rayon {pictogram_radius(canvas):.3f} (limite {SAFE_RADIUS})')
    save(canvas, 'icon-maskable-512.png', 512)


if __name__ == '__main__':
    main()
