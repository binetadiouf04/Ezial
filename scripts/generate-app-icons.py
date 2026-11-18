#!/usr/bin/env python3
"""Génère les icônes d'écran d'accueil d'Ezial à partir du logo officiel.

Source : docs/identite/logo-ezial-source.png (carré arrondi bordeaux sur fond
blanc, symbole crème). Le symbole est repris pixel pour pixel (forme et couleurs),
jamais redessiné. Seuls le fond et le cadrage sont refaits :

  - les coins blancs de l'image source disparaissent : l'icône est un carré
    plein (iOS applique lui-même ses coins arrondis) ;
  - le fond reprend le dégradé bordeaux de l'image source ;
  - le symbole est centré exactement.

Sorties (dans public/) :
  apple-touch-icon.png          180 x 180   iPhone / iPad (opaque, sans transparence)
  icons/icon-192.png            192 x 192   Android / manifeste / notifications
  icons/icon-512.png            512 x 512   Android / manifeste
  icons/icon-maskable-512.png   512 x 512   Android « adaptatif » : symbole réduit
                                            pour rester dans la zone sûre (cercle
                                            de 80 %) quel que soit le masque

Usage (Pillow et numpy requis) :
  python3 scripts/generate-app-icons.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / 'identite' / 'logo-ezial-source.png'
OUT = ROOT / 'public'
MASTER = 2048            # taille de travail, réduite ensuite (qualité)
SYMBOL_SCALE_ANY = 1.0   # symbole à la taille de l'image source (68,5 % de la largeur)
SAFE_RADIUS = 0.39       # zone sûre « maskable » : cercle de rayon 40 % (marge de 1 %)


def load_source():
    return np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float64)


def analyse(im):
    """Forme bordeaux, symbole crème (masque), plan du dégradé de fond."""
    h, w, _ = im.shape
    yy, xx = np.mgrid[0:h, 0:w]
    burgundy = (im[..., 1] < 40) & (im[..., 0] < 170)
    ys, xs = np.where(burgundy)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    size = float(x1 - x0 + 1)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # Symbole : pixels clairs dans un disque centré sur la forme (exclut les coins
    # blancs et le liseré clair du bord).
    rad = np.hypot(xx - cx, yy - cy)
    cream = (im[..., 0] > 200) & (im[..., 1] > 190) & (im[..., 2] > 170) & (rad < 0.46 * size)
    # Fond : pixels bordeaux hors symbole (dilaté), dans la zone intérieure.
    near_symbol = np.zeros_like(cream)
    sy, sx = np.where(cream)
    k = 10
    for dy in range(-k, k + 1, 5):
        for dx in range(-k, k + 1, 5):
            near_symbol[np.clip(sy + dy, 0, h - 1), np.clip(sx + dx, 0, w - 1)] = True
    inner = (np.abs(xx - cx) < 0.42 * size) & (np.abs(yy - cy) < 0.42 * size) & ~near_symbol & burgundy
    iy, ix = np.where(inner)
    u, v = (ix - x0) / size, (iy - y0) / size
    design = np.c_[u, v, np.ones_like(u)]
    plane = [np.linalg.lstsq(design, im[iy, ix, c], rcond=None)[0] for c in range(3)]
    return {'cx': cx, 'cy': cy, 'size': size, 'x0': x0, 'y0': y0, 'cream': cream, 'plane': plane}


def background(plane, side):
    u = np.linspace(0, 1, side)
    uu, vv = np.meshgrid(u, u)
    return np.clip(np.stack([p[0] * uu + p[1] * vv + p[2] for p in plane], axis=-1), 0, 255)


def extract_symbol(im, info):
    """Symbole en RGBA recadré : couleurs d'origine, transparence calculée."""
    cream = info['cream']
    ys, xs = np.where(cream)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
    pad = 12
    bx0, by0, bx1, by1 = bx0 - pad, by0 - pad, bx1 + pad, by1 + pad
    crop = im[by0:by1 + 1, bx0:bx1 + 1]
    # Fond local = plan du dégradé ; crème = moyenne des pixels pleins du symbole.
    full = cream & (im.min(axis=2) > 225)
    cream_mean = im[full].mean(axis=0)
    yy, xx = np.mgrid[by0:by1 + 1, bx0:bx1 + 1]
    u, v = (xx - info['x0']) / info['size'], (yy - info['y0']) / info['size']
    bg = np.stack([p[0] * u + p[1] * v + p[2] for p in info['plane']], axis=-1)
    axis = cream_mean - bg
    alpha = np.clip(((crop - bg) * axis).sum(axis=-1) / np.maximum((axis * axis).sum(axis=-1), 1e-6), 0, 1)
    alpha[alpha < 0.02] = 0
    # Couleurs d'origine là où le symbole est plein ; crème moyen ailleurs (bords lissés).
    color = np.where((alpha > 0.97)[..., None], crop, cream_mean)
    rgba = np.dstack([color, alpha * 255]).round().astype(np.uint8)
    real = alpha > 0.5
    ry, rx = np.where(real)
    sym_bbox = (rx.min(), ry.min(), rx.max() + 1, ry.max() + 1)
    return Image.fromarray(rgba, 'RGBA'), sym_bbox, (xs.max() - xs.min() + 1) / info['size']


def compose(symbol, sym_bbox, info, width_ratio, plane, side=MASTER):
    """Carré plein : fond bordeaux + symbole centré (centre de sa boîte englobante)."""
    canvas = Image.fromarray(background(plane, side).round().astype(np.uint8), 'RGB').convert('RGBA')
    bx0, by0, bx1, by1 = sym_bbox
    box_w = bx1 - bx0
    target_w = width_ratio * side
    scale = target_w / box_w
    new_size = (round(symbol.width * scale), round(symbol.height * scale))
    resized = symbol.resize(new_size, Image.LANCZOS)
    # Centrer la boîte englobante réelle du symbole au milieu du carré.
    cx_in = (bx0 + bx1) / 2 * scale
    cy_in = (by0 + by1) / 2 * scale
    ox = round(side / 2 - cx_in)
    oy = round(side / 2 - cy_in)
    canvas.alpha_composite(resized, (ox, oy))
    return canvas.convert('RGB')


def symbol_max_radius_ratio(symbol, sym_bbox, width_ratio):
    """Distance max d'un point du symbole à son centre, en fraction du côté de l'icône."""
    a = np.asarray(symbol)[..., 3] > 127
    ys, xs = np.where(a)
    bx0, by0, bx1, by1 = sym_bbox
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    r = np.hypot(xs - cx, ys - cy).max()
    return r * (width_ratio / (bx1 - bx0))


def save(img, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
    print(f'{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size} octets')


def main():
    im = load_source()
    info = analyse(im)
    symbol, sym_bbox, ratio = extract_symbol(im, info)
    width_any = ratio * SYMBOL_SCALE_ANY
    r_any = symbol_max_radius_ratio(symbol, sym_bbox, width_any)
    # Version « maskable » : le point le plus éloigné reste dans la zone sûre.
    width_mask = width_any * min(1.0, SAFE_RADIUS / r_any)
    print(f'symbole : {width_any:.3f} de la largeur (icône standard), {width_mask:.3f} (adaptative) ; '
          f'rayon max {r_any:.3f} -> {symbol_max_radius_ratio(symbol, sym_bbox, width_mask):.3f}')
    icon_any = compose(symbol, sym_bbox, info, width_any, info['plane'])
    icon_mask = compose(symbol, sym_bbox, info, width_mask, info['plane'])
    save(icon_any, OUT / 'apple-touch-icon.png', 180)
    save(icon_any, OUT / 'icons' / 'icon-192.png', 192)
    save(icon_any, OUT / 'icons' / 'icon-512.png', 512)
    save(icon_mask, OUT / 'icons' / 'icon-maskable-512.png', 512)


if __name__ == '__main__':
    main()
