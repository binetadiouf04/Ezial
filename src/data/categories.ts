// "À découvrir" photos — 24 images provided by the user, bundled locally
// (not Supabase Storage: this section's admin UI was removed earlier in
// this engagement and its source of truth is this file) and pre-optimized
// to 400×400 WebP. Import order below matches the exact 01→24 order given.
import discover01 from '@/assets/discover/01.webp';
import discover02 from '@/assets/discover/02.webp';
import discover03 from '@/assets/discover/03.webp';
import discover04 from '@/assets/discover/04.webp';
import discover05 from '@/assets/discover/05.webp';
import discover06 from '@/assets/discover/06.webp';
import discover07 from '@/assets/discover/07.webp';
import discover08 from '@/assets/discover/08.webp';
import discover09 from '@/assets/discover/09.webp';
import discover10 from '@/assets/discover/10.webp';
import discover11 from '@/assets/discover/11.webp';
import discover12 from '@/assets/discover/12.webp';
import discover13 from '@/assets/discover/13.webp';
import discover14 from '@/assets/discover/14.webp';
import discover15 from '@/assets/discover/15.webp';
import discover16 from '@/assets/discover/16.webp';
import discover17 from '@/assets/discover/17.webp';
import discover18 from '@/assets/discover/18.webp';
import discover19 from '@/assets/discover/19.webp';
import discover20 from '@/assets/discover/20.webp';
import discover21 from '@/assets/discover/21.webp';
import discover22 from '@/assets/discover/22.webp';
import discover23 from '@/assets/discover/23.webp';
import discover24 from '@/assets/discover/24.webp';

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
  { id: 'promos', label: 'Promos', image: discover01, route: '/promos', highlight: true },
  { id: 'mode-femme', label: 'Femme', image: discover02, route: '/categorie/vetements/femme' },
  { id: 'mode-homme', label: 'Homme', image: discover03, route: '/categorie/vetements/homme' },
  { id: 'robes', label: 'Robes', image: discover04, route: '/recherche?q=robes' },
  { id: 'traditionnel-femme', label: 'Traditionnel Femme', image: discover05, route: '/recherche?q=traditionnel femme' },
  { id: 'traditionnel-homme', label: 'Traditionnel Homme', image: discover06, route: '/recherche?q=traditionnel homme' },
  { id: 'made-in-senegal', label: 'Made in Senegal', image: discover07, route: '/recherche?q=made in senegal' },
  { id: 'chaussures', label: 'Chaussures', image: discover08, route: '/categorie/chaussures/femme' },
  { id: 'sacs-a-main', label: 'Sacs', image: discover09, route: '/categorie/sacs/sacs-a-main' },
  { id: 'maquillage', label: 'Maquillage', image: discover10, route: '/categorie/beaute/maquillage' },
  { id: 'faux-cils', label: 'Faux cils', image: discover11, route: '/recherche?q=faux cils' },
  { id: 'skincare', label: 'Skincare', image: discover12, route: '/categorie/beaute/skincare' },
  { id: 'press-on-nails', label: 'Press-on nails', image: discover13, route: '/categorie/beaute/mains-et-pieds' },
  // Streetwear/Voile/Abaya n'ont pas encore de sous-catégorie dédiée dans la
  // taxonomie (comme Robes ou Or plus haut) : ils routent vers une recherche
  // sur leur propre libellé, qui remontera les produits dès qu'un vendeur
  // les tague avec ce type/style.
  { id: 'streetwear', label: 'Streetwear', image: discover14, route: '/recherche?q=streetwear' },
  { id: 'voile', label: 'Voile', image: discover15, route: '/recherche?q=voile' },
  { id: 'abaya', label: 'Abaya', image: discover16, route: '/recherche?q=abaya' },
  { id: 'soins-capillaires', label: 'Soins capillaires', image: discover17, route: '/categorie/beaute/soins-capillaires' },
  { id: 'parfums-femme', label: 'Parfums Femme', image: discover18, route: '/categorie/parfums/parfums-femme' },
  { id: 'parfums-homme', label: 'Parfums Homme', image: discover19, route: '/categorie/parfums/parfums-homme' },
  { id: 'encens', label: 'Encens', image: discover20, route: '/categorie/parfums/encens-parfums-maison' },
  { id: 'bijoux', label: 'Bijoux', image: discover21, route: '/categorie/bijoux' },
  { id: 'or', label: 'Or', image: discover22, route: '/recherche?q=or' },
  { id: 'pyjamas', label: 'Pyjamas', image: discover23, route: '/categorie/lingerie/pyjamas' },
  { id: 'sous-vetements', label: 'Sous-vêtements', image: discover24, route: '/categorie/lingerie/sous-vetements' },
];
