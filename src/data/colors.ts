export interface ColorDef {
  name: string;
  hex: string;
  /** If true, the swatch gets a subtle border so light colors stay visible on white. */
  light?: boolean;
  /** If true, render as a multi-tone gradient instead of a solid fill. */
  multi?: boolean;
}

/**
 * Master color palette for EZIAL marketplace.
 * Used by the customer color selector and the Seller product creation interface.
 * A product only displays the colors the Seller has marked as available.
 */
export const colorPalette: ColorDef[] = [
  // Neutrals
  { name: 'Noir', hex: '#1a1a1a' },
  { name: 'Blanc', hex: '#ffffff', light: true },
  { name: 'Ivoire', hex: '#fffff0', light: true },
  { name: 'Crème', hex: '#fffef5', light: true },
  { name: 'Écru', hex: '#f5f0e1', light: true },
  { name: 'Beige', hex: '#d8c4a8', light: true },
  { name: 'Sable', hex: '#c2a878' },
  { name: 'Taupe', hex: '#8b8078' },
  { name: 'Camel', hex: '#c19a6b' },
  { name: 'Champagne', hex: '#e7d5b5', light: true },
  { name: 'Caramel', hex: '#a85c32' },
  { name: 'Chocolat', hex: '#3d2817' },
  { name: 'Marron', hex: '#5c4033' },
  { name: 'Café', hex: '#4a3526' },
  { name: 'Cognac', hex: '#8b5a2b' },
  { name: 'Nude', hex: '#e8c4a0', light: true },
  { name: 'Gris clair', hex: '#c0c0c0', light: true },
  { name: 'Gris', hex: '#808080' },
  { name: 'Gris anthracite', hex: '#383e42' },

  // Skin tones (foundation / concealer / powder / bronzer)
  { name: 'Très clair', hex: '#f2d5b8', light: true },
  { name: 'Clair', hex: '#e8c19c', light: true },
  { name: 'Medium', hex: '#c9915f' },
  { name: 'Deep', hex: '#4a2f1a' },

  // Reds
  { name: 'Rouge', hex: '#c8102e' },
  { name: 'Rouge vif', hex: '#e60026' },
  { name: 'Bordeaux', hex: '#5e1e2e' },
  { name: 'Bordeaux foncé', hex: '#580e25' },
  { name: 'Grenat', hex: '#6d2b3a' },
  { name: 'Brique', hex: '#a0493a' },
  { name: 'Terracotta', hex: '#c66b4e' },
  { name: 'Rouille', hex: '#b7410e' },
  { name: 'Cerise', hex: '#c41e3a' },

  // Pinks
  { name: 'Rose pâle', hex: '#f5d4d4', light: true },
  { name: 'Rose poudré', hex: '#e8b4b8', light: true },
  { name: 'Rose bonbon', hex: '#f4a6c6', light: true },
  { name: 'Vieux rose', hex: '#c08081' },
  { name: 'Rose', hex: '#e0507a' },
  { name: 'Brun rosé', hex: '#a86f66' },
  { name: 'Rose nude', hex: '#d49a8e', light: true },
  { name: 'Fuchsia', hex: '#d62c87' },
  { name: 'Framboise', hex: '#b02050' },
  { name: 'Saumon', hex: '#f88861' },
  { name: 'Corail', hex: '#ff7f68' },

  // Oranges / Yellows
  { name: 'Orange', hex: '#e8740c' },
  { name: 'Mandarine', hex: '#e8751e' },
  { name: 'Pêche', hex: '#ffc6a0', light: true },
  { name: 'Abricot', hex: '#e8a87c', light: true },
  { name: 'Jaune', hex: '#f4d03f', light: true },
  { name: 'Jaune pastel', hex: '#fce8a8', light: true },
  { name: 'Moutarde', hex: '#c49a22' },
  { name: 'Ocre', hex: '#cc8a3a' },
  { name: 'Or', hex: '#d4af37' },

  // Greens
  { name: 'Vert', hex: '#3a7d44' },
  { name: 'Vert pastel', hex: '#aee6c4', light: true },
  { name: 'Vert menthe', hex: '#9ee6c4' },
  { name: 'Vert sauge', hex: '#9caf88' },
  { name: 'Vert olive', hex: '#708238' },
  { name: 'Vert kaki', hex: '#777b4b' },
  { name: 'Vert bouteille', hex: '#2d5d3a' },
  { name: 'Vert forêt', hex: '#1b4d3a' },
  { name: 'Vert émeraude', hex: '#16865d' },
  { name: 'Vert citron', hex: '#c0eb52', light: true },

  // Blues
  { name: 'Bleu ciel', hex: '#87ceeb', light: true },
  { name: 'Bleu pastel', hex: '#a8c4ea', light: true },
  { name: 'Bleu', hex: '#2b6cb0' },
  { name: 'Bleu roi', hex: '#2455a4' },
  { name: 'Bleu marine', hex: '#1a2744' },
  { name: 'Bleu nuit', hex: '#161c3d' },
  { name: 'Bleu pétrole', hex: '#176b78' },
  { name: 'Bleu canard', hex: '#006d77' },
  { name: 'Turquoise', hex: '#3bc4d0' },
  { name: 'Cyan', hex: '#22c1d6' },

  // Purples
  { name: 'Lavande', hex: '#b7a1d5', light: true },
  { name: 'Lilas', hex: '#b88ee8' },
  { name: 'Mauve', hex: '#9c5ab8' },
  { name: 'Violet', hex: '#6a2c91' },
  { name: 'Prune', hex: '#673147' },
  { name: 'Aubergine', hex: '#2e1e30' },

  // Metallics
  { name: 'Doré', hex: '#d4af37' },
  { name: 'Argenté', hex: '#c0c0c0', light: true },
  { name: 'Argent', hex: '#c0c0c0', light: true },
  { name: 'Bronze', hex: '#9c6a3e' },
  { name: 'Cuivré', hex: '#b87333' },
  { name: 'Cuivre', hex: '#b87333' },
  { name: 'Or rose', hex: '#e8b4a0' },

  // Hair-specific (customer-friendly names)
  { name: 'Noir naturel', hex: '#1a1512' },
  { name: 'Noir', hex: '#0d0d0d' },
  { name: 'Brun foncé', hex: '#2a1e15' },
  { name: 'Brun', hex: '#4a3526' },
  { name: 'Châtain', hex: '#5c3a26' },
  { name: 'Chocolat', hex: '#3d2817' },
  { name: 'Caramel', hex: '#a85c32' },
  { name: 'Miel', hex: '#c8954a' },
  { name: 'Auburn', hex: '#7d3a1e' },
  { name: 'Blond miel', hex: '#c89c5a' },
  { name: 'Blond platine', hex: '#e8d4a0', light: true },
  { name: 'Natural Black', hex: '#1a1512' },
  { name: '1B', hex: '#1a1512' },
  { name: '2', hex: '#3a2a1e' },
  { name: '4', hex: '#5c3a26' },

  // Specials
  { name: 'Multicolore', hex: '#e0507a', multi: true },
  { name: 'Transparent', hex: '#f0f0f0', light: true },
];

export const colorMap: Record<string, ColorDef> = colorPalette.reduce((acc, c) => {
  acc[c.name] = c;
  return acc;
}, {} as Record<string, ColorDef>);

// Palette commune (Ezial Pro + marketplace) : chaque nom a sa pastille dans
// colorPalette ci-dessus (vérifié par src/data/colors.test.mjs). Un seul nom par
// couleur : les anciens synonymes (« Kaki », « Anthracite », « Rose fuchsia »)
// restent reconnus via COLOR_ALIASES mais ne sont plus proposés.
export const COMMON_COLOR_NAMES: string[] = [
  'Noir', 'Blanc', 'Ivoire', 'Crème', 'Écru', 'Beige', 'Taupe', 'Camel', 'Champagne', 'Marron', 'Chocolat', 'Terracotta',
  'Gris', 'Gris anthracite', 'Or', 'Argent', 'Bronze', 'Cuivre',
  'Rouge', 'Bordeaux', 'Bordeaux foncé', 'Rose', 'Rose poudré', 'Rose bonbon', 'Fuchsia', 'Corail', 'Saumon',
  'Orange', 'Jaune', 'Moutarde',
  'Vert', 'Vert menthe', 'Vert sauge', 'Vert olive', 'Vert kaki', 'Vert émeraude',
  'Turquoise', 'Bleu canard', 'Bleu pétrole', 'Bleu ciel', 'Bleu', 'Bleu roi', 'Bleu marine',
  'Lavande', 'Mauve', 'Lilas', 'Violet', 'Prune', 'Aubergine',
];

/** Bijoux et montres : finitions métal (Doré, Argenté, Or rose) puis la palette commune utile aux bijoux. Pas d'« Or » (voir goldJewelry.ts). */
export const JEWELRY_COLOR_NAMES: string[] = [
  'Doré', 'Argenté', 'Or rose', 'Champagne', 'Cuivre', 'Noir', 'Blanc', 'Ivoire', 'Crème', 'Beige', 'Taupe', 'Camel', 'Marron',
  'Gris anthracite', 'Terracotta', 'Rouge', 'Bordeaux', 'Bordeaux foncé', 'Rose', 'Fuchsia', 'Corail',
  'Lavande', 'Mauve', 'Violet', 'Prune', 'Bleu', 'Bleu ciel', 'Bleu roi', 'Bleu canard', 'Bleu pétrole', 'Bleu marine',
  'Vert', 'Vert sauge', 'Vert olive', 'Vert kaki', 'Vert émeraude', 'Turquoise',
  'Jaune', 'Moutarde', 'Orange', 'Multicolore',
];

/**
 * Anciens noms d'une même couleur → nom de référence. Une seule entrée est
 * proposée dans les listes (pas de doublon « Kaki » / « Vert kaki »), mais une
 * valeur déjà enregistrée sous l'ancien nom (produit, panier, commande) garde
 * sa pastille et correspond toujours au filtre. Aucune donnée n'est réécrite.
 */
export const COLOR_ALIASES: Record<string, string> = {
  Anthracite: 'Gris anthracite',
  Kaki: 'Vert kaki',
  'Rose fuchsia': 'Fuchsia',
};

/** Nom de référence d'une couleur (identique si ce n'est pas un ancien nom). */
export function canonicalColorName(name: string): string {
  return COLOR_ALIASES[name] ?? name;
}

export function getColor(name: string): ColorDef | undefined {
  const def = colorMap[name];
  if (def) return def;
  const alias = COLOR_ALIASES[name];
  // Même pastille, mais le nom affiché reste celui enregistré par le vendeur.
  return alias && colorMap[alias] ? { ...colorMap[alias], name } : undefined;
}

export function getColorHex(name: string): string | undefined {
  return getColor(name)?.hex;
}
