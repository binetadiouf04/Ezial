export type CategoryId =
  | 'vetements'
  | 'chaussures'
  | 'sacs'
  | 'beaute'
  | 'cheveux'
  | 'parfums'
  | 'bijoux'
  | 'lingerie';

export interface SubCategory { id: string; label: string; }
export interface Category { id: CategoryId; label: string; subcategories: SubCategory[]; }

export const categories: Category[] = [
  { id: 'vetements', label: 'Vêtements', subcategories: [
    { id: 'femme', label: 'Femme' }, { id: 'homme', label: 'Homme' },
  ]},
  { id: 'chaussures', label: 'Chaussures', subcategories: [
    { id: 'femme', label: 'Femme' }, { id: 'homme', label: 'Homme' },
  ]},
  { id: 'sacs', label: 'Sacs & Maroquinerie', subcategories: [
    { id: 'sacs-a-main', label: 'Sacs à main' }, { id: 'sacs-bandouliere', label: 'Sacs bandoulière' },
    { id: 'pochette', label: 'Pochette' }, { id: 'portefeuilles', label: 'Portefeuilles' }, { id: 'sacs-a-dos', label: 'Sacs à dos' },
  ]},
  { id: 'beaute', label: 'Beauté', subcategories: [
    { id: 'maquillage', label: 'Maquillage' }, { id: 'skincare', label: 'Skincare' },
    { id: 'soins-capillaires', label: 'Soins capillaires' }, { id: 'hygiene', label: 'Hygiène & soins corporels' },
  ]},
  { id: 'cheveux', label: 'Cheveux', subcategories: [
    { id: 'perruques', label: 'Perruques' }, { id: 'meches', label: 'Mèches' },
    { id: 'cheveux-naturels', label: 'Cheveux naturels' }, { id: 'blend-hair', label: 'Blend Hair' },
  ]},
  { id: 'parfums', label: 'Parfums & Senteurs', subcategories: [
    { id: 'parfums-femme', label: 'Parfums Femme' }, { id: 'parfums-homme', label: 'Parfums Homme' },
    { id: 'huiles-brumes', label: 'Huiles & Brumes' }, { id: 'encens-parfums-maison', label: 'Encens & Parfums de maison' },
  ]},
  { id: 'bijoux', label: 'Bijoux & Accessoires', subcategories: [
    { id: 'colliers', label: 'Colliers' }, { id: 'bracelets', label: 'Bracelets' }, { id: 'bagues', label: 'Bagues' },
    { id: 'boucles-oreilles', label: 'Boucles d\'oreilles' }, { id: 'montres', label: 'Montres' },
    { id: 'lunettes', label: 'Lunettes' }, { id: 'bijoux-de-taille', label: 'Bijou de taille' },
  ]},
  { id: 'lingerie', label: 'Pyjamas & Lingerie', subcategories: [
    { id: 'pyjamas', label: 'Pyjamas' }, { id: 'lingerie', label: 'Lingerie' },
    { id: 'sous-vetements', label: 'Sous-vêtements' }, { id: 'vetements-de-nuit', label: 'Vêtements de nuit' },
  ]},
];

export const categoryMap: Record<CategoryId, Category> = categories.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }), {} as Record<CategoryId, Category>,
);

export const categoryTiles: { id: CategoryId; label: string; image: string }[] = [
  { id: 'vetements', label: 'Vêtements', image: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'beaute', label: 'Beauté', image: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'cheveux', label: 'Cheveux', image: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'parfums', label: 'Parfums', image: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'chaussures', label: 'Chaussures', image: 'https://images.pexels.com/photos/31450733/pexels-photo-31450733.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'sacs', label: 'Sacs', image: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'bijoux', label: 'Bijoux', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'lingerie', label: 'Pyjamas & Lingerie', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
];
