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
  { name: 'Taupe', hex: '#7d6f5a' },
  { name: 'Camel', hex: '#b8895a' },
  { name: 'Caramel', hex: '#a85c32' },
  { name: 'Chocolat', hex: '#3d2817' },
  { name: 'Marron', hex: '#5c4033' },
  { name: 'Café', hex: '#4a3526' },
  { name: 'Cognac', hex: '#8b5a2b' },
  { name: 'Nude', hex: '#e8c4a0', light: true },
  { name: 'Gris clair', hex: '#c0c0c0', light: true },
  { name: 'Gris', hex: '#808080' },
  { name: 'Anthracite', hex: '#383838' },

  // Skin tones (foundation / concealer / powder / bronzer)
  { name: 'Très clair', hex: '#f2d5b8', light: true },
  { name: 'Clair', hex: '#e8c19c', light: true },
  { name: 'Medium', hex: '#c9915f' },
  { name: 'Deep', hex: '#4a2f1a' },

  // Reds
  { name: 'Rouge', hex: '#c8102e' },
  { name: 'Rouge vif', hex: '#e60026' },
  { name: 'Bordeaux', hex: '#5e1e2e' },
  { name: 'Grenat', hex: '#6d2b3a' },
  { name: 'Brique', hex: '#a0493a' },
  { name: 'Terracotta', hex: '#c66b4a' },
  { name: 'Rouille', hex: '#b7410e' },
  { name: 'Cerise', hex: '#c41e3a' },

  // Pinks
  { name: 'Rose pâle', hex: '#f5d4d4', light: true },
  { name: 'Rose poudré', hex: '#e8b4b8', light: true },
  { name: 'Vieux rose', hex: '#c08081' },
  { name: 'Rose', hex: '#e0507a' },
  { name: 'Brun rosé', hex: '#a86f66' },
  { name: 'Rose nude', hex: '#d49a8e', light: true },
  { name: 'Fuchsia', hex: '#d6368e' },
  { name: 'Framboise', hex: '#b02050' },
  { name: 'Saumon', hex: '#f88861' },
  { name: 'Corail', hex: '#ff7f50' },

  // Oranges / Yellows
  { name: 'Orange', hex: '#e8740c' },
  { name: 'Mandarine', hex: '#e8751e' },
  { name: 'Pêche', hex: '#ffc6a0', light: true },
  { name: 'Abricot', hex: '#e8a87c', light: true },
  { name: 'Jaune', hex: '#f4d03f', light: true },
  { name: 'Jaune pastel', hex: '#fce8a8', light: true },
  { name: 'Moutarde', hex: '#c4a030' },
  { name: 'Ocre', hex: '#cc8a3a' },
  { name: 'Or', hex: '#d4af37' },

  // Greens
  { name: 'Vert', hex: '#3a7d44' },
  { name: 'Vert pastel', hex: '#aee6c4', light: true },
  { name: 'Vert menthe', hex: '#9ee6c4' },
  { name: 'Vert sauge', hex: '#8ba888' },
  { name: 'Vert olive', hex: '#6b7a3a' },
  { name: 'Kaki', hex: '#5a5d3a' },
  { name: 'Vert bouteille', hex: '#2d5d3a' },
  { name: 'Vert forêt', hex: '#1b4d3a' },
  { name: 'Vert émeraude', hex: '#1c8a5b' },
  { name: 'Vert citron', hex: '#c0eb52', light: true },

  // Blues
  { name: 'Bleu ciel', hex: '#a8d4ea', light: true },
  { name: 'Bleu pastel', hex: '#a8c4ea', light: true },
  { name: 'Bleu', hex: '#2b6cb0' },
  { name: 'Bleu roi', hex: '#1a3fb0' },
  { name: 'Bleu marine', hex: '#1a2744' },
  { name: 'Bleu nuit', hex: '#161c3d' },
  { name: 'Bleu pétrole', hex: '#1a3a4a' },
  { name: 'Turquoise', hex: '#3bc4d0' },
  { name: 'Cyan', hex: '#22c1d6' },

  // Purples
  { name: 'Lavande', hex: '#c8b8e8', light: true },
  { name: 'Lilas', hex: '#b88ee8' },
  { name: 'Mauve', hex: '#9c5ab8' },
  { name: 'Violet', hex: '#6a2c91' },
  { name: 'Prune', hex: '#4a2540' },
  { name: 'Aubergine', hex: '#2e1e30' },

  // Metallics
  { name: 'Doré', hex: '#d4af37' },
  { name: 'Argenté', hex: '#c0c0c0', light: true },
  { name: 'Bronze', hex: '#9c6a3e' },
  { name: 'Cuivré', hex: '#b87333' },
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

export function getColor(name: string): ColorDef | undefined {
  return colorMap[name];
}

export function getColorHex(name: string): string | undefined {
  return colorMap[name]?.hex;
}
