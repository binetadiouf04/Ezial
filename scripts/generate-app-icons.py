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

Variante Ezial Admin (python3 scripts/generate-app-icons.py --admin) : mêmes
formes, couleurs inversées (fond crème #F8F3EE uni, symbole bordeaux #5A0D1E
uni, aucune inscription, aucun dégradé). Le symbole vient du même fichier
officiel (même masque de transparence, même taille relative que l'icône d'Ezial
Marketplace) ; seules les couleurs changent, celles de la charte. Sorties dans public/icons/admin/ ; les fichiers de
l'application Marketplace ne sont pas touchés.

  public/icons/admin/apple-touch-icon.png  180 x 180
  public/icons/admin/icon-192.png          192 x 192
  public/icons/admin/icon-512.png          512 x 512
  public/icons/admin/icon-maskable-512.png 512 x 512  (symbole dans la zone sûre)

Favicons des onglets, favoris et résultats de recherche
(python3 scripts/generate-app-icons.py --favicons) : même symbole officiel, un
peu plus grand dans le carré pour rester lisible à 16 px.
  Marketplace (papillon crème sur fond bordeaux) : public/favicon.ico,
    favicon-16x16.png, favicon-32x32.png, favicon-48x48.png
  Admin (papillon bordeaux sur fond crème) : public/icons/admin/favicon.ico,
    favicon-16x16.png, favicon-32x32.png, favicon-48x48.png

Usage (Pillow et numpy requis) :
  python3 scripts/generate-app-icons.py            # Ezial Marketplace (icônes existantes)
  python3 scripts/generate-app-icons.py --admin    # Ezial Admin
  python3 scripts/generate-app-icons.py --favicons # favicons Marketplace et Admin
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / 'identite' / 'logo-ezial-source.png'
OUT = ROOT / 'public'
MASTER = 2048            # taille de travail, réduite ensuite (qualité)
SYMBOL_SCALE_ANY = 1.0   # symbole à la taille de l'image source (68,5 % de la largeur)
SAFE_RADIUS = 0.39       # zone sûre « maskable » : cercle de rayon 40 % (marge de 1 %)
# Ezial Admin : couleurs de la charte (CLAUDE.md), fond et symbole unis.
ADMIN_CREAM = (248, 243, 238)      # #F8F3EE
ADMIN_BURGUNDY = (90, 13, 30)      # #5A0D1E
FAVICON_SYMBOL_RATIO = 0.80        # part de la largeur occupée par le symbole dans un favicon


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


def compose_inverted(symbol, sym_bbox, width_ratio, cream, burgundy, side=MASTER):
    """Carré plein crème + symbole bordeaux uni, même cadrage que compose()."""
    canvas = Image.new('RGBA', (side, side), tuple(int(round(c)) for c in cream) + (255,))
    # Aplat : le symbole officiel (crème) a des reflets satinés qui donnent une
    # transparence partielle à l'intérieur ; on la rend pleine (la position des
    # bords, à 50 %, ne bouge pas) pour obtenir un symbole uni, sans effet.
    alpha = np.clip((np.asarray(symbol)[..., 3].astype(np.float64) / 255 - 0.25) / 0.5, 0, 1) * 255
    alpha = alpha.round().astype(np.uint8)
    solid = np.zeros(alpha.shape + (4,), dtype=np.uint8)
    solid[..., :3] = np.round(burgundy).astype(np.uint8)
    solid[..., 3] = alpha
    layer = Image.fromarray(solid, 'RGBA')
    bx0, by0, bx1, by1 = sym_bbox
    scale = width_ratio * side / (bx1 - bx0)
    resized = layer.resize((round(layer.width * scale), round(layer.height * scale)), Image.LANCZOS)
    ox = round(side / 2 - (bx0 + bx1) / 2 * scale)
    oy = round(side / 2 - (by0 + by1) / 2 * scale)
    canvas.alpha_composite(resized, (ox, oy))
    return canvas.convert('RGB')


def save(img, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
    print(f'{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size} octets')


def save_favicons(master, out_dir):
    """favicon-16/32/48 en PNG et favicon.ico (16, 32 et 48 dans un seul fichier)."""
    for size in (16, 32, 48):
        save(master, out_dir / f'favicon-{size}x{size}.png', size)
    ico = out_dir / 'favicon.ico'
    master.resize((256, 256), Image.LANCZOS).save(ico, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'{ico.relative_to(ROOT)}  16+32+48  {ico.stat().st_size} octets')


SHARE_SIZE = (1200, 630)    # format recommandé pour l'aperçu d'un lien (Open Graph)
SHARE_SYMBOL_HEIGHT = 0.52  # part de la hauteur occupée par le symbole
SHARE_RUBY = (140, 16, 36)  # rouge rubis #8C1024 (identité visuelle)


def save_share_image(symbol, sym_bbox, out_path):
    """Aperçu d'un lien : aplat rouge rubis, papillon officiel crème centré, sans texte."""
    w, h = SHARE_SIZE
    k = 2  # travail en double taille, puis réduction (bords nets)
    canvas = Image.new('RGBA', (w * k, h * k), SHARE_RUBY + (255,))
    # Même aplat que l'icône Admin : le symbole officiel, en crème uni.
    alpha = np.clip((np.asarray(symbol)[..., 3].astype(np.float64) / 255 - 0.25) / 0.5, 0, 1) * 255
    solid = np.zeros(alpha.shape + (4,), dtype=np.uint8)
    solid[..., :3] = ADMIN_CREAM
    solid[..., 3] = alpha.round().astype(np.uint8)
    layer = Image.fromarray(solid, 'RGBA')
    bx0, by0, bx1, by1 = sym_bbox
    scale = SHARE_SYMBOL_HEIGHT * h * k / (by1 - by0)
    resized = layer.resize((round(layer.width * scale), round(layer.height * scale)), Image.LANCZOS)
    ox = round(w * k / 2 - (bx0 + bx1) / 2 * scale)
    oy = round(h * k / 2 - (by0 + by1) / 2 * scale)
    canvas.alpha_composite(resized, (ox, oy))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert('RGB').resize((w, h), Image.LANCZOS).save(out_path, 'PNG', optimize=True)
    print(f'{out_path.relative_to(ROOT)}  {w}x{h}  {out_path.stat().st_size} octets')


def main():
    admin = '--admin' in sys.argv[1:]
    favicons = '--favicons' in sys.argv[1:]
    share = '--partage' in sys.argv[1:]
    im = load_source()
    info = analyse(im)
    symbol, sym_bbox, ratio = extract_symbol(im, info)
    width_any = ratio * SYMBOL_SCALE_ANY
    r_any = symbol_max_radius_ratio(symbol, sym_bbox, width_any)
    # Version « maskable » : le point le plus éloigné reste dans la zone sûre.
    width_mask = width_any * min(1.0, SAFE_RADIUS / r_any)
    print(f'symbole : {width_any:.3f} de la largeur (icône standard), {width_mask:.3f} (adaptative) ; '
          f'rayon max {r_any:.3f} -> {symbol_max_radius_ratio(symbol, sym_bbox, width_mask):.3f}')
    if share:
        save_share_image(symbol, sym_bbox, OUT / 'ezial-partage.png')
        return
    if favicons:
        cream, burgundy = np.array(ADMIN_CREAM, dtype=np.float64), np.array(ADMIN_BURGUNDY, dtype=np.float64)
        save_favicons(compose(symbol, sym_bbox, info, FAVICON_SYMBOL_RATIO, info['plane'], side=1024), OUT)
        save_favicons(compose_inverted(symbol, sym_bbox, FAVICON_SYMBOL_RATIO, cream, burgundy, side=1024), OUT / 'icons' / 'admin')
        return
    if admin:
        cream, burgundy = np.array(ADMIN_CREAM, dtype=np.float64), np.array(ADMIN_BURGUNDY, dtype=np.float64)
        out = OUT / 'icons' / 'admin'
        icon_any = compose_inverted(symbol, sym_bbox, width_any, cream, burgundy)
        icon_mask = compose_inverted(symbol, sym_bbox, width_mask, cream, burgundy)
        save(icon_any, out / 'apple-touch-icon.png', 180)
        save(icon_any, out / 'icon-192.png', 192)
        save(icon_any, out / 'icon-512.png', 512)
        save(icon_mask, out / 'icon-maskable-512.png', 512)
        return
    icon_any = compose(symbol, sym_bbox, info, width_any, info['plane'])
    icon_mask = compose(symbol, sym_bbox, info, width_mask, info['plane'])
    save(icon_any, OUT / 'apple-touch-icon.png', 180)
    save(icon_any, OUT / 'icons' / 'icon-192.png', 192)
    save(icon_any, OUT / 'icons' / 'icon-512.png', 512)
    save(icon_mask, OUT / 'icons' / 'icon-maskable-512.png', 512)


if __name__ == '__main__':
    main()
