export type CategoryId =
  | 'vetements'
  | 'chaussures'
  | 'sacs'
  | 'beaute'
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
    { id: 'mains-et-pieds', label: 'Manucure & Pédicure' },
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
  { id: 'parfums', label: 'Parfums', image: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'chaussures', label: 'Chaussures', image: 'https://images.pexels.com/photos/31450733/pexels-photo-31450733.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'sacs', label: 'Sacs', image: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'bijoux', label: 'Bijoux', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
  { id: 'lingerie', label: 'Pyjamas & Lingerie', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
];

export interface HomeCircleTile { id: string; label: string; image: string; route: string; highlight?: boolean; }

// Curated shortcut circles shown on the homepage — a mix of Promos + the
// most relevant subcategories (not the full category list, and no exact
// semantic duplicates: a specific item is only kept alongside its general
// category when it adds a genuinely distinct shortcut, e.g. Bijoux +
// Colliers). Images are reused from the same flagship products they
// represent, for visual consistency. Items with no dedicated subcategory
// route through a search query on their own label instead of a fabricated
// category id.
//
// Deliberately capped at 24 (4 rows × 6 on tablet/desktop — see
// DiscoverMarquee) so each circle can render large and legible instead of
// shrinking to fit everything in; trimming this list is what keeps the
// circles big, not the other way around. Categories left out of this
// shortcut row (Chemises, Kimono, Sandales, Baskets, Gommage, Colliers,
// Nuisettes) are untouched everywhere else — full taxonomy, category pages
// and search all still have them.
export const homeCircleTiles: HomeCircleTile[] = [
  { id: 'promos', label: 'Promos', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/promos', highlight: true },
  { id: 'mode-femme', label: 'Femme', image: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/vetements/femme' },
  { id: 'mode-homme', label: 'Homme', image: 'https://images.pexels.com/photos/34695268/pexels-photo-34695268.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/vetements/homme' },
  { id: 'robes', label: 'Robes', image: 'https://images.pexels.com/photos/1755428/pexels-photo-1755428.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=robes' },
  { id: 'traditionnel-femme', label: 'Traditionnel Femme', image: 'https://images.pexels.com/photos/38277759/pexels-photo-38277759.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=traditionnel femme' },
  { id: 'traditionnel-homme', label: 'Traditionnel Homme', image: 'https://images.pexels.com/photos/19320006/pexels-photo-19320006.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=traditionnel homme' },
  { id: 'made-in-senegal', label: 'Made in Senegal', image: 'https://images.pexels.com/photos/34991789/pexels-photo-34991789.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=made in senegal' },
  { id: 'chaussures', label: 'Chaussures', image: 'https://images.pexels.com/photos/29393718/pexels-photo-29393718.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/chaussures/femme' },
  { id: 'sacs-a-main', label: 'Sacs', image: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/sacs/sacs-a-main' },
  { id: 'maquillage', label: 'Maquillage', image: 'https://images.pexels.com/photos/10338698/pexels-photo-10338698.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/maquillage' },
  { id: 'faux-cils', label: 'Faux cils', image: 'https://images.pexels.com/photos/3373736/pexels-photo-3373736.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=faux cils' },
  { id: 'skincare', label: 'Skincare', image: 'https://images.pexels.com/photos/12352170/pexels-photo-12352170.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/skincare' },
  { id: 'press-on-nails', label: 'Press-on nails', image: 'https://images.pexels.com/photos/4938515/pexels-photo-4938515.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/mains-et-pieds' },
  // Streetwear/Voile/Abaya n'ont pas encore de sous-catégorie dédiée dans la
  // taxonomie (comme Robes ou Or plus haut) : ils routent vers une recherche
  // sur leur propre libellé, qui remontera les produits dès qu'un vendeur
  // les tague avec ce type/style. Images temporaires réutilisées du dépôt en
  // attendant les nouvelles photos.
  { id: 'streetwear', label: 'Streetwear', image: 'https://images.pexels.com/photos/34695268/pexels-photo-34695268.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=streetwear' },
  { id: 'voile', label: 'Voile', image: 'https://images.pexels.com/photos/38277759/pexels-photo-38277759.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=voile' },
  { id: 'abaya', label: 'Abaya', image: 'https://images.pexels.com/photos/1755428/pexels-photo-1755428.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=abaya' },
  { id: 'soins-capillaires', label: 'Soins capillaires', image: 'https://images.pexels.com/photos/13734819/pexels-photo-13734819.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/beaute/soins-capillaires' },
  { id: 'parfums-femme', label: 'Parfums Femme', image: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums/parfums-femme' },
  { id: 'parfums-homme', label: 'Parfums Homme', image: 'https://images.pexels.com/photos/965880/pexels-photo-965880.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums/parfums-homme' },
  { id: 'encens', label: 'Encens', image: 'https://images.pexels.com/photos/30746012/pexels-photo-30746012.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/parfums/encens-parfums-maison' },
  { id: 'bijoux', label: 'Bijoux', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/bijoux' },
  { id: 'or', label: 'Or', image: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/recherche?q=or' },
  { id: 'pyjamas', label: 'Pyjamas', image: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/lingerie/pyjamas' },
  { id: 'sous-vetements', label: 'Sous-vêtements', image: 'https://images.pexels.com/photos/6568208/pexels-photo-6568208.jpeg?auto=compress&cs=tinysrgb&h=400&w=400', route: '/categorie/lingerie/sous-vetements' },
];
