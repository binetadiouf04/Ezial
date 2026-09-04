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

export interface HomeCircleTile { id: string; label: string; image: string; route: string; highlight?: boolean; }

// Curated shortcut circles shown on the homepage — a mix of Promos + a few
// popular subcategories (not the full category list). Images are reused
// from the same flagship products they represent, for visual consistency.
export const homeCircleTiles: HomeCircleTile[] = [
  { id: 'promos', label: 'Promos', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/promos', highlight: true },
  { id: 'mode-femme', label: 'Femme', image: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/vetements/femme' },
  { id: 'mode-homme', label: 'Homme', image: 'https://images.pexels.com/photos/34695268/pexels-photo-34695268.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/vetements/homme' },
  { id: 'chaussures', label: 'Chaussures', image: 'https://images.pexels.com/photos/29393718/pexels-photo-29393718.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/chaussures/femme' },
  { id: 'sacs-a-main', label: 'Sacs', image: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/sacs/sacs-a-main' },
  { id: 'maquillage', label: 'Maquillage', image: 'https://images.pexels.com/photos/10338698/pexels-photo-10338698.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/maquillage' },
  { id: 'skincare', label: 'Skincare', image: 'https://images.pexels.com/photos/12352170/pexels-photo-12352170.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/skincare' },
  { id: 'raw-hair', label: 'Raw Hair', image: 'https://images.pexels.com/photos/15868319/pexels-photo-15868319.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/cheveux/cheveux-naturels' },
  { id: 'perruques', label: 'Perruques', image: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/cheveux/perruques' },
  { id: 'soins-capillaires', label: 'Soins capillaires', image: 'https://images.pexels.com/photos/13734819/pexels-photo-13734819.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/soins-capillaires' },
  { id: 'parfums-femme', label: 'Parfums Femme', image: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums/parfums-femme' },
  { id: 'parfums', label: 'Parfums', image: 'https://images.pexels.com/photos/30405427/pexels-photo-30405427.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums' },
  { id: 'encens', label: 'Encens', image: 'https://images.pexels.com/photos/30746012/pexels-photo-30746012.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums/encens-parfums-maison' },
  { id: 'bijoux', label: 'Bijoux', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/bijoux' },
  { id: 'colliers', label: 'Colliers', image: 'https://images.pexels.com/photos/13219289/pexels-photo-13219289.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/bijoux/colliers' },
  { id: 'montres', label: 'Montre', image: 'https://images.pexels.com/photos/13219289/pexels-photo-13219289.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/bijoux/montres' },
  { id: 'or', label: 'Or', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=or' },
  { id: 'nuisette', label: 'Nuisette', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/lingerie/lingerie' },
  { id: 'pyjamas', label: 'Pyjamas', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/lingerie/pyjamas' },
  { id: 'pyjamas-lingerie', label: 'Pyjamas & Lingerie', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/lingerie' },
];
