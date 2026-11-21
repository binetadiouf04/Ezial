import { fabricTypes, fabricSaleModeLabels, type CategoryId } from './categories';
import { COMMON_COLOR_NAMES, JEWELRY_COLOR_NAMES } from './colors';

export interface FilterGroup { id: string; label: string; options: string[]; collapsible?: boolean }

export const globalPriceFilter: FilterGroup = {
  id: 'prix',
  label: 'Prix',
  options: ['Moins de 10 000 FCFA', '10 000 – 25 000 FCFA', '25 000 – 75 000 FCFA', 'Plus de 75 000 FCFA'],
};

// Palette commune (Ezial Pro + marketplace) : définie dans src/data/colors.ts.
export const commonColors: string[] = COMMON_COLOR_NAMES;

// Motifs/imprimés — a distinct dimension from COULEUR: never rendered as a
// solid-color swatch (Léopard, Floral, etc. have no single hex value).
export const commonPrints: string[] = [
  'Léopard', 'Tigre', 'Zèbre', 'Serpent', 'Crocodile', 'Floral / fleurs', 'Pois',
  'Rayures', 'Carreaux', 'Géométrique', 'Abstrait', 'Tie-dye', 'Wax / imprimé africain', 'Multicolore',
];

export const clothingSizes: string[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Taille standard'];

const parfumsFemmeNotes = ['Floral', 'Fruité', 'Vanillé', 'Gourmand', 'Musqué', 'Ambré', 'Poudré', 'Frais', 'Agrumes', 'Oriental'];
const parfumsHommeNotes = ['Boisé', 'Aromatique', 'Épicé', 'Ambré', 'Musqué', 'Cuir', 'Frais', 'Agrumes', 'Aquatique', 'Fougère', 'Oriental'];
const allFragranceNotes = [...new Set([...parfumsFemmeNotes, ...parfumsHommeNotes])];

const encensMaisonTypes = ['Encens', 'Diffuseur', 'Bougie', 'Huile à brûler', 'Parfum d\'ambiance'];

// Pas d'« Or » : la vente de bijoux en or véritable n'est pas autorisée sur Ezial
// (voir src/lib/goldJewelry.ts). « Plaqué or », « Fantaisie » et « Acier
// inoxydable » restent proposés. Ces options alimentent à la fois le filtre
// client et le formulaire vendeur.
const jewelryMaterials = ['Argent', 'Plaqué or', 'Acier inoxydable', 'Perles', 'Fantaisie'];
const jewelryColors: string[] = JEWELRY_COLOR_NAMES;

const shoeTypesFemme = ['Baskets', 'Sandales', 'Talons', 'Mules', 'Claquettes', 'Ballerines', 'Mocassins', 'Chaussures plateformes', 'Bottes & bottines'];
const shoeTypesHomme = ['Baskets', 'Sandales', 'Claquettes', 'Mocassins', 'Chaussures habillées', 'Bottes & bottines'];
const shoeSizes = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

const clothingStyles = ['Mode africaine', 'Mode moderne', 'Mode modeste'];
const clothingTypesFemme = [
  'Robes', 'Tops, blouses & chemises', 'T-shirts', 'Ensembles', 'Jupes', 'Pantalons', 'Jeans', 'Shorts',
  'Pantalons larges', 'Jogging & sweatpants', 'Tenues de sport', 'Combinaisons & combishorts', 'Abayas',
  'Caftans & tenues traditionnelles', 'Mode modeste', 'Vestes & blazers', 'Gilets', 'Pulls & sweats',
  'Grande taille', 'Maillots & tenues de bain',
];
const clothingTypesHomme = [
  'T-shirts', 'Polos', 'Chemises', 'Ensembles', 'Pantalons', 'Pantalons larges', 'Jeans', 'Shorts',
  'Jogging & sweatpants', 'Tenues de sport', 'Sweats & hoodies', 'Vestes & blazers', 'Boubous & tenues traditionnelles',
  'Grande taille',
];

// Pyjamas & Lingerie : deux sous-catégories seulement, sans doublon entre elles.
// Un « Type » ne répète jamais la sous-catégorie : il précise la pièce.
const nightwearTypes = ['Pyjama', 'Nuisette', 'Chemise de nuit', 'Peignoir'];
const lingerieTypes = ['Soutien-gorge', 'Culotte', 'Ensemble', 'Body', 'Caleçon / boxer'];

// Bagues : tailles américaines (8, 8.5, 10…), celles utilisées par Ezial et ses
// vendeurs, de 5 à 13 par demi-taille, plus « Taille standard » pour les bagues
// ajustables ou à taille unique. Variante de stock (« Taille »).
export const ringSizes: string[] = [...Array.from({ length: 17 }, (_, i) => String(5 + i / 2)), 'Taille standard'];

// Lunettes : caractéristiques propres (la « Matière » des bijoux ne s'applique
// pas à une monture). Identifiants = libellé sans accents ni espaces, comme pour
// les montres (lien filtre client ↔ caractéristique enregistrée).
export const GLASSES_GROUP_IDS = ['typedelunettes', 'forme', 'monture'] as const;
const lunettesFilters: FilterGroup[] = [
  { id: 'typedelunettes', label: 'Type de lunettes', options: ['Lunettes de soleil', 'Lunettes de vue', 'Anti-lumière bleue'] },
  { id: 'forme', label: 'Forme', options: ['Ronde', 'Carrée', 'Rectangulaire', 'Ovale', 'Aviateur', 'Papillon', 'Oversize'] },
  { id: 'monture', label: 'Monture', options: ['Métal', 'Acétate / plastique', 'Sans monture'] },
  { id: 'public', label: 'Public', options: ['Homme', 'Femme', 'Mixte'] },
  { id: 'couleur', label: 'Couleur', options: JEWELRY_COLOR_NAMES, collapsible: true },
  globalPriceFilter,
];

const makeupProductTypes = ['Fond de teint', 'Anticernes', 'Poudre', 'Blush', 'Bronzer', 'Highlighter', 'Mascara', 'Eyeliner', 'Palette', 'Fard à paupières', 'Rouge à lèvres', 'Gloss', 'Crayon à lèvres', 'Crayon à sourcils', 'Faux cils'];

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

// Manucure & Pédicure: Longueur/Forme/Type de style only ever apply to Faux
// ongles — SellerProductForm adds them conditionally on top of this base
// list, the same way it already does for Encens & Parfums de maison.
const manucurePedicureTypes = ['Faux ongles', 'Soins', 'Henné', 'Vernis'];

const manucurePedicureFilters: FilterGroup[] = [
  { id: 'typeproduit', label: 'Type de produit', options: manucurePedicureTypes },
  globalPriceFilter,
];

const vetementsFemmeFilters: FilterGroup[] = [
  { id: 'style', label: 'Style', options: clothingStyles },
  { id: 'type', label: 'Type de vêtement', options: clothingTypesFemme },
  { id: 'taille', label: 'Taille', options: clothingSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
  globalPriceFilter,
];

const vetementsHommeFilters: FilterGroup[] = [
  { id: 'style', label: 'Style', options: clothingStyles },
  { id: 'type', label: 'Type de vêtement', options: clothingTypesHomme },
  { id: 'taille', label: 'Taille', options: clothingSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
  globalPriceFilter,
];

const chaussuresFemmeFilters: FilterGroup[] = [
  { id: 'type', label: 'Type de chaussure', options: shoeTypesFemme },
  { id: 'taille', label: 'Pointure', options: shoeSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
  globalPriceFilter,
];

const chaussuresHommeFilters: FilterGroup[] = [
  { id: 'type', label: 'Type de chaussure', options: shoeTypesHomme },
  { id: 'taille', label: 'Pointure', options: shoeSizes },
  { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
  { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
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

// Montres : quatre caractéristiques simples (choix unique, facultatives) à la
// place de « Matière ». Les identifiants reprennent le libellé sans accents ni
// espaces : c'est ce qui relie le filtre client à la caractéristique
// enregistrée (descriptive_attributes, clé = libellé). Couleur et motif
// restent les variantes habituelles (stock par variante) ; pour les montres,
// le vendeur peut aussi saisir ses combinaisons (« Cadran blanc / Bracelet
// noir », voir src/lib/variantValues.ts). Rien de technique (mouvement,
// étanchéité…) : le vendeur le précise librement dans la description.
export const WATCH_GROUP_IDS = ['typedemontre', 'matieredubracelet', 'formeducadran', 'public'] as const;
const montresFilters: FilterGroup[] = [
  { id: 'typedemontre', label: 'Type de montre', options: ['Analogique', 'Numérique', 'Connectée'] },
  { id: 'matieredubracelet', label: 'Matière du bracelet', options: ['Métal', 'Cuir', 'Silicone', 'Autre'] },
  { id: 'formeducadran', label: 'Forme du cadran', options: ['Rond', 'Carré', 'Rectangulaire', 'Autre'] },
  { id: 'public', label: 'Public', options: ['Homme', 'Femme', 'Mixte'] },
  { id: 'couleur', label: 'Couleur', options: jewelryColors, collapsible: true },
  { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
  globalPriceFilter,
];

export const subcategoryFilters: Record<string, FilterGroup[]> = {
  'beaute/maquillage': makeupFilters,
  'beaute/skincare': skincareFilters,
  'beaute/soins-capillaires': haircareFilters,
  'beaute/hygiene': hygieneFilters,
  'beaute/mains-et-pieds': manucurePedicureFilters,
  'vetements/femme': vetementsFemmeFilters,
  'vetements/homme': vetementsHommeFilters,
  'chaussures/femme': chaussuresFemmeFilters,
  'chaussures/homme': chaussuresHommeFilters,
  'parfums/parfums-femme': parfumsFemmeFilters,
  'parfums/parfums-homme': parfumsHommeFilters,
  'parfums/huiles-brumes': huilesBrumesFilters,
  'parfums/encens-parfums-maison': encensMaisonFilters,
  'bijoux/montres': montresFilters,
  'bijoux/lunettes': lunettesFilters,
  'bijoux/bagues': [
    { id: 'matiere', label: 'Matière', options: jewelryMaterials },
    { id: 'taille', label: 'Taille', options: ringSizes },
    { id: 'couleur', label: 'Couleur', options: jewelryColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  'lingerie/pyjamas': [
    { id: 'type', label: 'Type', options: nightwearTypes },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  'lingerie/lingerie': [
    { id: 'type', label: 'Type', options: lingerieTypes },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
};

export const filterConfig: Record<CategoryId, FilterGroup[]> = {
  vetements: [
    { id: 'style', label: 'Style', options: clothingStyles },
    { id: 'type', label: 'Type de vêtement', options: clothingTypesFemme },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  chaussures: [
    { id: 'type', label: 'Type de chaussure', options: shoeTypesFemme },
    { id: 'taille', label: 'Pointure', options: shoeSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  // No 'type' group here on purpose: the subcategory already selected
  // (Sacs à main, Sacs bandoulière, Pochette, Portefeuilles, Sacs à dos —
  // see categories.ts) is the exact same classification a "Type" group
  // would otherwise ask for again.
  sacs: [
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  // Toute la beauté (maquillage, skincare, cheveux…) : aucun filtre qui
  // mélangerait les types de produits ; chaque sous-catégorie a les siens.
  beaute: [
    globalPriceFilter,
  ],
  parfums: [
    { id: 'famille', label: 'Notes / Famille olfactive', options: allFragranceNotes },
    globalPriceFilter,
  ],
  // No 'type' group here on purpose: the subcategory already selected
  // (Colliers, Bracelets, Bagues, Boucles d'oreilles, Montres, Lunettes,
  // Baya, Ensemble/Parure — see categories.ts) is the exact same
  // classification a "Type" group would otherwise ask for again.
  bijoux: [
    { id: 'matiere', label: 'Matière', options: jewelryMaterials },
    { id: 'couleur', label: 'Couleur', options: jewelryColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  lingerie: [
    { id: 'type', label: 'Type', options: [...nightwearTypes, ...lingerieTypes] },
    { id: 'taille', label: 'Taille', options: clothingSizes },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
    globalPriceFilter,
  ],
  tissus: [
    { id: 'typetissu', label: 'Type de tissu', options: [...fabricTypes] },
    { id: 'modevente', label: 'Mode de vente', options: Object.values(fabricSaleModeLabels) },
    { id: 'couleur', label: 'Couleur', options: commonColors, collapsible: true },
    { id: 'motif', label: 'Motif / Imprimé', options: commonPrints, collapsible: true },
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
