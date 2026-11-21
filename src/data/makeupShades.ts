import type { ColorDef } from './colors.ts';

// Teintes de maquillage, propres à chaque type de produit (un fond de teint ne
// se décline pas comme un crayon à sourcils). Inspiré du classement Sephora :
// pour le teint, une profondeur (très clair → très foncé) et un sous-ton
// (rosé, neutre, doré, olive) ; pour les sourcils, la couleur des cheveux.
// Ce sont des familles de teintes : le vendeur coche celles qu'il a en stock,
// le nom exact de la marque (ex. « 330N ») reste libre dans la description.
// Chaque nom a sa pastille, ajoutée à la palette commune (src/data/colors.ts).

const DEPTHS = ['Très clair', 'Clair', 'Moyen', 'Mat', 'Foncé', 'Très foncé'] as const;
const UNDERTONES = ['rosé', 'neutre', 'doré', 'olive'] as const;

// Pastilles du teint : une ligne par profondeur, dans l'ordre des sous-tons.
const TEINT_HEX: Record<(typeof DEPTHS)[number], [string, string, string, string]> = {
  'Très clair': ['#f3d6c7', '#f1d3b8', '#f2d2aa', '#e9d2ae'],
  Clair: ['#e8bfa6', '#e6be9a', '#e8bb8a', '#dcbc8f'],
  Moyen: ['#d09a7c', '#cc9870', '#cf9a63', '#bf9866'],
  Mat: ['#a86e52', '#a66f4a', '#ac7140', '#9c7044'],
  Foncé: ['#7a4a37', '#774a32', '#7e4e2c', '#6f4d2f'],
  'Très foncé': ['#4d2c22', '#4a2d1f', '#503019', '#45301e'],
};

const teintDefs: ColorDef[] = DEPTHS.flatMap((depth) =>
  UNDERTONES.map((tone, i) => ({ name: `${depth} ${tone}`, hex: TEINT_HEX[depth][i], light: depth === 'Très clair' || depth === 'Clair' })),
);

/** Fond de teint, anticernes : 6 profondeurs × 4 sous-tons. */
export const TEINT_SHADES: string[] = teintDefs.map((d) => d.name);

/** Poudre : les mêmes teintes, plus la poudre translucide (sans couleur). */
export const POUDRE_SHADES: string[] = ['Translucide', ...TEINT_SHADES];

/** Bronzer (terre de soleil) : du plus doré au plus profond. */
export const BRONZER_SHADES: string[] = ['Bronze doré', 'Bronze ambré', 'Bronze cuivré', 'Bronze profond'];

/** Highlighter (enlumineur). */
export const HIGHLIGHTER_SHADES: string[] = ['Perle', 'Champagne', 'Doré', 'Or rose', 'Bronze'];

/** Blush. */
export const BLUSH_SHADES: string[] = ['Rose', 'Fuchsia', 'Pêche', 'Corail', 'Abricot', 'Terracotta', 'Mauve', 'Baie', 'Prune', 'Brun rosé'];

/** Rouge à lèvres et crayon à lèvres : des nudes (clair → chocolat) aux rouges profonds. */
export const LIP_SHADES: string[] = [
  'Nude clair', 'Nude', 'Rose nude', 'Nude caramel', 'Nude chocolat',
  'Rose', 'Fuchsia', 'Corail', 'Orange', 'Rouge', 'Bordeaux', 'Baie', 'Prune', 'Mauve', 'Brun', 'Chocolat',
];

/** Gloss : les teintes des lèvres, plus le gloss transparent. */
export const GLOSS_SHADES: string[] = ['Transparent', ...LIP_SHADES];

/** Mascara. */
export const MASCARA_SHADES: string[] = ['Noir', 'Noir intense', 'Brun', 'Transparent'];

/** Eyeliner et crayon pour les yeux. */
export const EYELINER_SHADES: string[] = ['Noir', 'Brun', 'Bleu marine', 'Vert', 'Bordeaux', 'Blanc', 'Doré', 'Argenté'];

/** Crayon à sourcils : d'après la couleur des cheveux (blond → noir). */
export const BROW_SHADES: string[] = ['Blond', 'Taupe', 'Châtain clair', 'Châtain', 'Brun', 'Brun foncé', 'Ébène', 'Graphite'];

/** Fard à paupières (une seule teinte). */
export const EYESHADOW_SHADES: string[] = [
  'Nude', 'Champagne', 'Doré', 'Bronze', 'Cuivré', 'Terracotta', 'Marron', 'Chocolat', 'Taupe',
  'Rose', 'Prune', 'Violet', 'Bleu', 'Turquoise', 'Vert', 'Argenté', 'Noir', 'Blanc',
];

/** Palette : on choisit son harmonie, pas une teinte unique. */
export const PALETTE_SHADES: string[] = ['Tons nude', 'Tons chauds', 'Tons smoky', 'Tons colorés', 'Tons pailletés'];

/** Teintes proposées pour chaque type de produit de maquillage (aucune pour les faux cils). */
export const MAKEUP_SHADES_BY_TYPE: Record<string, string[]> = {
  'Fond de teint': TEINT_SHADES,
  Anticernes: TEINT_SHADES,
  Poudre: POUDRE_SHADES,
  Bronzer: BRONZER_SHADES,
  Highlighter: HIGHLIGHTER_SHADES,
  Blush: BLUSH_SHADES,
  'Rouge à lèvres': LIP_SHADES,
  'Crayon à lèvres': LIP_SHADES,
  Gloss: GLOSS_SHADES,
  Mascara: MASCARA_SHADES,
  Eyeliner: EYELINER_SHADES,
  'Crayon à sourcils': BROW_SHADES,
  'Fard à paupières': EYESHADOW_SHADES,
  Palette: PALETTE_SHADES,
};

/** Pastilles des noms propres au maquillage (les autres existent déjà dans la palette commune). */
export const MAKEUP_SHADE_DEFS: ColorDef[] = [
  ...teintDefs,
  { name: 'Translucide', hex: '#f4efe9', light: true },
  { name: 'Bronze doré', hex: '#b9814f' },
  { name: 'Bronze ambré', hex: '#a56a3f' },
  { name: 'Bronze cuivré', hex: '#8d5432' },
  { name: 'Bronze profond', hex: '#663b23' },
  { name: 'Perle', hex: '#f1e9e1', light: true },
  { name: 'Baie', hex: '#8e2846' },
  { name: 'Nude clair', hex: '#e9c3a9', light: true },
  { name: 'Nude caramel', hex: '#b97b5a' },
  { name: 'Nude chocolat', hex: '#7c4a37' },
  { name: 'Noir intense', hex: '#050505' },
  { name: 'Blond', hex: '#a88158' },
  { name: 'Châtain clair', hex: '#7a5537' },
  { name: 'Ébène', hex: '#241812' },
  { name: 'Graphite', hex: '#2f2d2c' },
  { name: 'Tons nude', hex: '#c9a28a', multi: true },
  { name: 'Tons chauds', hex: '#b9653f', multi: true },
  { name: 'Tons smoky', hex: '#4a4545', multi: true },
  { name: 'Tons colorés', hex: '#6a2c91', multi: true },
  { name: 'Tons pailletés', hex: '#d4af37', multi: true },
];
