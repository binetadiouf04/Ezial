import type { CategoryId } from './categories';

export interface FilterGroup { id: string; label: string; options: string[]; collapsible?: boolean }

export const globalPriceFilter: FilterGroup = {
  id: 'prix',
  label: 'Prix',
  options: ['Moins de 10 000 FCFA', '10 000 – 25 000 FCFA', '25 000 – 75 000 FCFA', 'Plus de 75 000 FCFA'],
};

export const commonColors: string[] = [
  'Noir', 'Blanc', 'Ivoire', 'Crème', 'Beige', 'Marron', 'Camel', 'Gris',
  'Rouge', 'Bordeaux', 'Rose', 'Bleu', 'Bleu marine', 'Vert', 'Kaki', 'Jaune', 'Orange', 'Violet', 'Mauve', 'Turquoise',
];

export const clothingSizes: string[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Taille standard'];

const hairTextures = ['Straight', 'Body Wave', 'Deep Wave', 'Loose Wave', 'Water Wave', 'Curly', 'Kinky Curly', 'Kinky Straight', 'Afro', 'Yaki Straight'];
const hairLengths = ['10"', '12"', '14"', '16"', '18"', '20"', '22"', '24"', '26"', '28"', '30"', '32"', '32"+'];
const hairDensities = ['150%', '180%', '200%'];
const hairColors = ['Noir naturel', 'Noir', 'Brun foncé', 'Brun', 'Châtain', 'Chocolat', 'Caramel', 'Miel', 'Auburn', 'Bordeaux', 'Blond', 'Blond miel', 'Blond platine', 'Gris', 'Rouge', 'Cuivré'];
const hairMaterials = ['Synthetic Hair', 'Blend Hair', 'Cheveux naturels', 'Raw Hair', 'Romance', 'Cheveux vietnamiens', 'Cheveux indiens'];

const parfumsFemmeNotes = ['Floral', 'Fruité', 'Vanillé', 'Gourmand', 'Musqué', 'Ambré', 'Poudré', 'Frais', 'Agrumes', 'Oriental'];
const parfumsHommeNotes = ['Boisé', 'Aromatique', 'Épicé', 'Ambré', 'Musqué', 'Cuir', 'Frais', 'Agrumes', 'Aquatique', 'Fougère', 'Oriental'];
const allFragranceNotes = [...new Set([...parfumsFemmeNotes, ...parfumsHommeNotes])];

const encensMaisonTypes = ['Encens', 'Diffuseur', 'Bougie', 'Cire parfumée', 'Parfum d\'ambiance'];

const jewelryTypes = ['Collier', 'Bracelet', 'Bague', 'Boucles d\'oreilles', 'Montre', 'Lunettes', 'Bijou de taille'];
const jewelryMaterials = ['Or', 'Argent', 'Plaqué or', 'Acier inoxydable', 'Perles'];

const bagTypes = ['Sac à main', 'Sac bandoulière', 'Pochette', 'Portefeuille', 'Sac à dos'];

const shoeTypesFemme = ['Ballerines', 'Sandales', 'Talons', 'Escarpins', 'Mocassins', 'Baskets'];
const shoeTypesHomme = ['Baskets', 'Mocassins', 'Sandales', 'Derbies', 'Chaussures habillées'];
const shoeSizes = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

const clothingStyles = ['Mode africaine', 'Mode moderne', 'Mode modeste'];
const clothingTypesFemme = ['Robe', 'Ensemble', 'Top', 'Chemise', 'T-shirt', 'Pantalon', 'Jean', 'Jupe', 'Combinaison', 'Veste', 'Blazer'];
const clothingTypesHomme = ['T-shirt', 'Polo', 'Chemise', 'Pantalon', 'Jean', 'Short', 'Ensemble', 'Sweat / Hoodie', 'Veste', 'Blazer', 'Costume', 'Boubou / Tenue africaine'];

const lingerieTypes = ['Pyjama', 'Nuisette', 'Soutien-gorge', 'Culotte', 'Sous-vêtement', 'Caleçon'];

const makeupProductTypes = ['Fond de teint', 'Anticernes', 'Poudre', 'Blush', 'Bronzer', 'Highlighter', 'Mascara', 'Eyeliner', 'Palette', 'Fard à paupières', 'Rouge à lèvres', 'Gloss', 'Crayon à lèvres', 'Crayon à sourcils'];

const makeupFilters: FilterGroup[] = [
  { id: 'typeproduit', label: 'Type de produit', options: makeupProductTypes },
  globalPriceFilter,
];

const skincareFilters: FilterGroup[] = [
  { id: 'peau', label: 'Type de peau', options: ['Sèche', 'Mixte', 'Grasse', 'Sensible', 'Normale'] },
  { id: 'besoin', label: 'Besoin', options: ['Hydratation', 'Imperfections', 'Taches / hyperpigmentation', 'Éclat', 'Anti-âge', 'Texture / pores', 'Apaisement'] },
  { id: 'typeproduit', label: 'Type de produit', options: ['Nettoyant', 'Sérum', 'Crème', 'Toner', 'Masque', 'Exfoliant', 'SPF'] },
  globalPriceFilter,
];

const haircareFilters: FilterGroup[] = [
  { id: 'besoin', label: 'Besoin', options: ['Hydratation', 'Nutrition', 'Pousse', 'Anti-chute', 'Anti-casse', 'Définition des boucles', 'Réparation', 'Pellicules / cuir chevelu'] },
  { id: 'typeproduit', label: 'Type de produit', options: ['Shampooing', 'Après-shampooing', 'Masque', 'Huile', 'Sérum', 'Leave-in', 'Crème coiffante'] },
  globalPriceFilter,
];

const hygieneFilters: FilterGroup[] = [
  { id: 'besoin', label: 'Besoin', options: ['Hydratation', 'Nettoyage', 'Exfoliation', 'Anti-taches', 'Déodorant', 'Soin des mains', 'Soin des pieds'] },
  globalPriceFilter,
];

const vetementsFemmeFilters: FilterGroup[] = [
  { id: 'style', label: 'Style', options: clothingStyles },
  { id: 'type', label: 'Type de vêtement', options: clothingTypesFemme },
  { id: 'taille', label: 'Taille', options: clothingSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  globalPriceFilter,
];

const vetementsHommeFilters: FilterGroup[] = [
  { id: 'style', label: 'Style', options: clothingStyles },
  { id: 'type', label: 'Type de vêtement', options: clothingTypesHomme },
  { id: 'taille', label: 'Taille', options: clothingSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  globalPriceFilter,
];

const chaussuresFemmeFilters: FilterGroup[] = [
  { id: 'type', label: 'Type de chaussure', options: shoeTypesFemme },
  { id: 'taille', label: 'Pointure', options: shoeSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  globalPriceFilter,
];

const chaussuresHommeFilters: FilterGroup[] = [
  { id: 'type', label: 'Type de chaussure', options: shoeTypesHomme },
  { id: 'taille', label: 'Pointure', options: shoeSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  globalPriceFilter,
];

const parfumsFemmeFilters: FilterGroup[] = [
  { id: 'famille', label: 'Notes / Famille olfactive', options: parfumsFemmeNotes },
  globalPriceFilter,
];

const parfumsHommeFilters: FilterGroup[] = [
  { id: 'famille', label: 'Notes / Famille olfactive', options: parfumsHommeNotes },
  globalPriceFilter,
];

const huilesBrumesFilters: FilterGroup[] = [
  globalPriceFilter,
];

const encensMaisonFilters: FilterGroup[] = [
  { id: 'typeproduit', label: 'Type de produit', options: encensMaisonTypes },
  globalPriceFilter,
];

export const subcategoryFilters: Record<string, FilterGroup[]> = {
  'beaute/maquillage': makeupFilters,
  'beaute/skincare': skincareFilters,
  'beaute/soins-capillaires': haircareFilters,
  'beaute/hygiene': hygieneFilters,
  'vetements/femme': vetementsFemmeFilters,
  'vetements/homme': vetementsHommeFilters,
  'chaussures/femme': chaussuresFemmeFilters,
  'chaussures/homme': chaussuresHommeFilters,
  'parfums/parfums-femme': parfumsFemmeFilters,
  'parfums/parfums-homme': parfumsHommeFilters,
  'parfums/huiles-brumes': huilesBrumesFilters,
  'parfums/encens-parfums-maison': encensMaisonFilters,
};

export const filterConfig: Record<CategoryId, FilterGroup[]> = {
  vetements: [
    { id: 'style', label: 'Style', options: clothingStyles },
    { id: 'type', label: 'Type de vêtement', options: clothingTypesFemme },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    globalPriceFilter,
  ],
  chaussures: [
    { id: 'type', label: 'Type de chaussure', options: shoeTypesFemme },
    { id: 'taille', label: 'Pointure', options: shoeSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    globalPriceFilter,
  ],
  sacs: [
    { id: 'type', label: 'Type', options: bagTypes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    globalPriceFilter,
  ],
  beaute: [
    { id: 'peau', label: 'Type de peau', options: ['Sèche', 'Mixte', 'Grasse', 'Sensible', 'Normale'] },
    { id: 'besoin', label: 'Besoin', options: ['Hydratation', 'Imperfections', 'Éclat', 'Anti-âge'] },
    { id: 'typeproduit', label: 'Type de produit', options: ['Sérum', 'Crème', 'Palette', 'Rouge à lèvres', 'Nettoyant', 'Masque'] },
    globalPriceFilter,
  ],
  cheveux: [
    { id: 'texture', label: 'Texture', options: hairTextures },
    { id: 'longueur', label: 'Longueur', options: hairLengths },
    { id: 'densite', label: 'Densité', options: hairDensities },
    { id: 'couleur', label: 'Couleur', options: hairColors, collapsible: true },
    { id: 'matiere', label: 'Matière / Type de cheveu', options: hairMaterials },
    globalPriceFilter,
  ],
  parfums: [
    { id: 'famille', label: 'Notes / Famille olfactive', options: allFragranceNotes },
    globalPriceFilter,
  ],
  bijoux: [
    { id: 'type', label: 'Type', options: jewelryTypes },
    { id: 'matiere', label: 'Matière', options: jewelryMaterials },
    { id: 'couleur', label: 'Couleur', options: ['Doré', 'Argenté', 'Or rose', 'Noir'], collapsible: true },
    globalPriceFilter,
  ],
  lingerie: [
    { id: 'type', label: 'Type', options: lingerieTypes },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    globalPriceFilter,
  ],
};

export function getFilters(categoryId: string, subId?: string): FilterGroup[] {
  if (subId) {
    const subKey = `${categoryId}/${subId}`;
    if (subcategoryFilters[subKey]) return subcategoryFilters[subKey];
  }
  return filterConfig[categoryId as CategoryId] ?? [];
}
