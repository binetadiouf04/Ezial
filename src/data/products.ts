import type { CategoryId } from './categories';
import { shops as allShops, type Shop } from './shops';

export interface Review { id: string; author: string; rating: number; date: string; text: string; hasPhotos: boolean; verified: boolean; }
export interface VariantOption { name: string; values: string[]; }
export interface VariantPrice {
  conditions: Record<string, string>;
  price: number;
  oldPrice?: number;
  stock?: number;
}
export interface Product {
  id: string; reference: string; name: string; shopId: string; category: CategoryId; subcategory: string;
  price: number; oldPrice?: number; images: string[];
  rating?: number; reviewCount?: number; stock: number;
  variants: VariantOption[]; description: string;
  details: { label: string; value: string }[];
  delivery: string; pickup?: string;
  isNew?: boolean; isTrending?: boolean; isPromo?: boolean; reviews: Review[];
  variantPrices?: VariantPrice[];
  texture?: string;
  hairMaterial?: string;
  gender?: 'femme' | 'homme';
  shoeGender?: 'femme' | 'homme';
}

const I = {
  dress1: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress2: 'https://images.pexels.com/photos/38904179/pexels-photo-38904179.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress3: 'https://images.pexels.com/photos/35986264/pexels-photo-35986264.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress4: 'https://images.pexels.com/photos/28124786/pexels-photo-28124786.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress5: 'https://images.pexels.com/photos/34991789/pexels-photo-34991789.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag1: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag2: 'https://images.pexels.com/photos/6650009/pexels-photo-6650009.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag3: 'https://images.pexels.com/photos/21897309/pexels-photo-21897309.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag4: 'https://images.pexels.com/photos/21897147/pexels-photo-21897147.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe1: 'https://images.pexels.com/photos/31450733/pexels-photo-31450733.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe3: 'https://images.pexels.com/photos/29393718/pexels-photo-29393718.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe4: 'https://images.pexels.com/photos/27023941/pexels-photo-27023941.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare1: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare2: 'https://images.pexels.com/photos/12146904/pexels-photo-12146904.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare3: 'https://images.pexels.com/photos/8101534/pexels-photo-8101534.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare4: 'https://images.pexels.com/photos/27357170/pexels-photo-27357170.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume1: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume2: 'https://images.pexels.com/photos/20419734/pexels-photo-20419734.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume3: 'https://images.pexels.com/photos/27357173/pexels-photo-27357173.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume4: 'https://images.pexels.com/photos/20899863/pexels-photo-20899863.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry1: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry2: 'https://images.pexels.com/photos/13219289/pexels-photo-13219289.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry3: 'https://images.pexels.com/photos/36324985/pexels-photo-36324985.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup1: 'https://images.pexels.com/photos/7256145/pexels-photo-7256145.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup2: 'https://images.pexels.com/photos/10338698/pexels-photo-10338698.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup3: 'https://images.pexels.com/photos/17156387/pexels-photo-17156387.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair1: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair2: 'https://images.pexels.com/photos/14730875/pexels-photo-14730875.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair3: 'https://images.pexels.com/photos/14730872/pexels-photo-14730872.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair4: 'https://images.pexels.com/photos/18614263/pexels-photo-18614263.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe5: 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe6: 'https://images.pexels.com/photos/2562992/pexels-photo-2562992.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe7: 'https://images.pexels.com/photos/261301/pexels-photo-261301.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag5: 'https://images.pexels.com/photos/762354/pexels-photo-762354.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag6: 'https://images.pexels.com/photos/2079246/pexels-photo-2079246.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress6: 'https://images.pexels.com/photos/1755428/pexels-photo-1755428.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress7: 'https://images.pexels.com/photos/1755385/pexels-photo-1755385.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress8: 'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress9: 'https://images.pexels.com/photos/8214396/pexels-photo-8214396.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme1: 'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme2: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme3: 'https://images.pexels.com/photos/1300550/pexels-photo-1300550.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare5: 'https://images.pexels.com/photos/3737599/pexels-photo-3737599.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare6: 'https://images.pexels.com/photos/3755659/pexels-photo-3755659.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup4: 'https://images.pexels.com/photos/2536965/pexels-photo-2536965.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup5: 'https://images.pexels.com/photos/3373736/pexels-photo-3373736.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair5: 'https://images.pexels.com/photos/3993461/pexels-photo-3993461.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair6: 'https://images.pexels.com/photos/3993462/pexels-photo-3993462.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume5: 'https://images.pexels.com/photos/965880/pexels-photo-965880.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume6: 'https://images.pexels.com/photos/3760263/pexels-photo-3760263.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry4: 'https://images.pexels.com/photos/1191531/pexels-photo-1191531.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry5: 'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry6: 'https://images.pexels.com/photos/3616760/pexels-photo-3616760.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie1: 'https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie2: 'https://images.pexels.com/photos/2064098/pexels-photo-2064098.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie3: 'https://images.pexels.com/photos/6568208/pexels-photo-6568208.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie4: 'https://images.pexels.com/photos/6568205/pexels-photo-6568205.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  encens1: 'https://images.pexels.com/photos/4202320/pexels-photo-4202320.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress10: 'https://images.pexels.com/photos/20009925/pexels-photo-20009925.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress11: 'https://images.pexels.com/photos/35463700/pexels-photo-35463700.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress12: 'https://images.pexels.com/photos/38277759/pexels-photo-38277759.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  dress13: 'https://images.pexels.com/photos/36636771/pexels-photo-36636771.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme4: 'https://images.pexels.com/photos/19320006/pexels-photo-19320006.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme5: 'https://images.pexels.com/photos/34695268/pexels-photo-34695268.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme6: 'https://images.pexels.com/photos/8526816/pexels-photo-8526816.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  homme7: 'https://images.pexels.com/photos/37320665/pexels-photo-37320665.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair7: 'https://images.pexels.com/photos/13734819/pexels-photo-13734819.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair8: 'https://images.pexels.com/photos/15868319/pexels-photo-15868319.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair9: 'https://images.pexels.com/photos/15868320/pexels-photo-15868320.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  hair10: 'https://images.pexels.com/photos/13221802/pexels-photo-13221802.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag7: 'https://images.pexels.com/photos/21897149/pexels-photo-21897149.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  bag8: 'https://images.pexels.com/photos/21263499/pexels-photo-21263499.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe8: 'https://images.pexels.com/photos/3782788/pexels-photo-3782788.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe9: 'https://images.pexels.com/photos/36589770/pexels-photo-36589770.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  shoe10: 'https://images.pexels.com/photos/36589772/pexels-photo-36589772.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume7: 'https://images.pexels.com/photos/15097440/pexels-photo-15097440.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume8: 'https://images.pexels.com/photos/13875783/pexels-photo-13875783.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume9: 'https://images.pexels.com/photos/7850600/pexels-photo-7850600.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  perfume10: 'https://images.pexels.com/photos/14736080/pexels-photo-14736080.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry7: 'https://images.pexels.com/photos/7541805/pexels-photo-7541805.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry8: 'https://images.pexels.com/photos/7541807/pexels-photo-7541807.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  jewelry9: 'https://images.pexels.com/photos/30746012/pexels-photo-30746012.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup6: 'https://images.pexels.com/photos/33793986/pexels-photo-33793986.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup7: 'https://images.pexels.com/photos/2536009/pexels-photo-2536009.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  makeup8: 'https://images.pexels.com/photos/4938515/pexels-photo-4938515.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare7: 'https://images.pexels.com/photos/7670680/pexels-photo-7670680.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare8: 'https://images.pexels.com/photos/12352170/pexels-photo-12352170.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  skincare9: 'https://images.pexels.com/photos/7691162/pexels-photo-7691162.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie5: 'https://images.pexels.com/photos/20337341/pexels-photo-20337341.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie6: 'https://images.pexels.com/photos/20337356/pexels-photo-20337356.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
  lingerie7: 'https://images.pexels.com/photos/7162037/pexels-photo-7162037.jpeg?auto=compress&cs=tinysrgb&h=900&w=700',
};

const r = (id: string, author: string, rating: number, date: string, text: string, hasPhotos = false): Review => ({ id, author, rating, date, text, hasPhotos, verified: true });
const D = 'Livraison à Dakar · 4–48 h';
const P4 = 'Retrait en boutique · À partir de 4 h';

export const products: Product[] = [
  // === VÊTEMENTS — Femme ===
  { id: 'robe-longue-satinee', reference: 'EZ-MAI-0001', name: 'Robe longue satinée', shopId: 'maison-fatou', category: 'vetements', subcategory: 'femme', gender: 'femme', price: 29900, oldPrice: 35000, images: [I.dress1, I.dress3, I.dress5, I.dress10], rating: 4.8, reviewCount: 24, stock: 6, variants: [{ name: 'Couleur', values: ['Noir', 'Bordeaux', 'Ivoire'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL'] }], description: 'Robe longue en satin fluide, coupe drapée à la taille. Tombé élégant pour vos soirées et cérémonies.', details: [{ label: 'Matière', value: 'Satin polyester' }, { label: 'Coupe', value: 'Longue, drapée' }, { label: 'Style', value: 'Mode moderne' }, { label: 'Type', value: 'Robes' }, { label: 'Entretien', value: 'Lavage à main' }], delivery: D, pickup: P4, isTrending: true, isPromo: true, reviews: [r('r1', 'Awa D.', 5, '2026-07-12', 'Robe magnifique, satin de très belle qualité.', true), r('r2', 'Fatou S.', 4, '2026-06-28', 'Très jolie robe, couleur fidèle.')] },
    { id: 'robe-wax-contemporaine', reference: 'EZ-MAI-0002', name: 'Robe wax contemporaine', shopId: 'maison-fatou', category: 'vetements', subcategory: 'femme', gender: 'femme', price: 28000, images: [I.dress5, I.dress1, I.dress12, I.dress11], rating: 4.9, reviewCount: 31, stock: 2, variants: [{ name: 'Taille', values: ['S', 'M', 'L', 'XL'] }], description: 'Robe en wax authentique, coupe contemporaine.', details: [{ label: 'Matière', value: 'Coton wax' }, { label: 'Origine', value: 'Tissu local' }, { label: 'Style', value: 'Mode africaine' }, { label: 'Type', value: 'Traditionnel' }], delivery: D, isNew: true, reviews: [r('r4', 'Ndeye K.', 5, '2026-08-02', 'Wax de qualité, couture impeccable.', true)] },
    { id: 'combinaison-femme-soiree', reference: 'EZ-MAI-0003', name: 'Combinaison femme soirée', shopId: 'maison-fatou', category: 'vetements', subcategory: 'femme', gender: 'femme', price: 27000, images: [I.dress7, I.dress9], rating: 4.6, reviewCount: 9, stock: 5, variants: [{ name: 'Couleur', values: ['Bordeaux', 'Noir', 'Vert émeraude'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL'] }], description: 'Combinaison fluide pour soirées et événements.', details: [{ label: 'Matière', value: 'Viscose' }, { label: 'Style', value: 'Mode moderne' }, { label: 'Type', value: 'Ensembles' }], delivery: D, pickup: P4, isTrending: true, reviews: [r('r23', 'Aïssatou B.', 5, '2026-07-28', 'Combinaison superbe, tombe parfaitement.')] },
    
  // === VÊTEMENTS — Homme ===
  { id: 'chemise-homme-wax', reference: 'EZ-MAI-0004', name: 'Chemise homme wax', shopId: 'maison-fatou', category: 'vetements', subcategory: 'homme', gender: 'homme', price: 22000, images: [I.homme1, I.homme2], rating: 4.6, reviewCount: 16, stock: 8, variants: [{ name: 'Taille', values: ['S', 'M', 'L', 'XL', 'XXL'] }], description: 'Chemise en wax, coupe moderne.', details: [{ label: 'Matière', value: 'Coton wax' }, { label: 'Style', value: 'Mode africaine' }, { label: 'Type', value: 'Chemises' }], delivery: D, isNew: true, reviews: [r('r26', 'Moussa D.', 5, '2026-08-01', 'Chemise belle et bien coupée.')] },
  { id: 'boubou-homme-elegant', reference: 'EZ-MAI-0005', name: 'Boubou homme élégant', shopId: 'maison-fatou', category: 'vetements', subcategory: 'homme', gender: 'homme', price: 38000, images: [I.homme2, I.homme3, I.homme4, I.homme5], rating: 4.9, reviewCount: 11, stock: 4, variants: [{ name: 'Couleur', values: ['Blanc', 'Bleu marine', 'Bordeaux'] }, { name: 'Taille', values: ['M', 'L', 'XL', 'XXL', '3XL'] }], description: 'Boubou traditionnel brodé, grande occasion.', details: [{ label: 'Matière', value: 'Coton brodé' }, { label: 'Style', value: 'Mode africaine' }, { label: 'Type', value: 'Traditionnel' }], delivery: D, isTrending: true, reviews: [r('r27', 'Ibrahima S.', 5, '2026-07-20', 'Boubou magnifique pour les cérémonies.')] },
    { id: 'pantalon-homme-chino', reference: 'EZ-MAI-0006', name: 'Pantalon homme chino', shopId: 'maison-fatou', category: 'vetements', subcategory: 'homme', gender: 'homme', price: 16500, oldPrice: 21000, images: [I.homme1, I.homme3], rating: 4.5, reviewCount: 18, stock: 10, variants: [{ name: 'Couleur', values: ['Beige', 'Noir', 'Bleu marine', 'Kaki'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL', 'XXL'] }], description: 'Pantalon chino stretch, coupe slim.', details: [{ label: 'Matière', value: 'Coton stretch' }, { label: 'Style', value: 'Mode moderne' }, { label: 'Type', value: 'Pantalons' }], delivery: D, isPromo: true, reviews: [r('r29', 'Omar S.', 4, '2026-07-18', 'Bon pantalon, taille bien.')] },

  // === CHAUSSURES — Femme ===
  { id: 'escarpins-talons-hauts', reference: 'EZ-MAI-0007', name: 'Escarpins talons hauts', shopId: 'maison-fatou', category: 'chaussures', subcategory: 'femme', shoeGender: 'femme', price: 21000, images: [I.shoe3, I.shoe1, I.shoe8, I.shoe10], rating: 4.5, reviewCount: 15, stock: 3, variants: [{ name: 'Couleur', values: ['Nude', 'Noir', 'Bleu'] }, { name: 'Taille', values: ['36', '37', '38', '39', '40', '41'] }], description: 'Escarpins élégants, talon 8 cm.', details: [{ label: 'Talon', value: '8 cm' }, { label: 'Type', value: 'Escarpins' }, { label: 'Matière', value: 'Cuir synthétique premium' }], delivery: D, isNew: true, reviews: [r('r8', 'Diariatou S.', 4, '2026-07-18', 'Très élégants, taille un peu grand.')] },
  { id: 'sandales-cuir-minimales', reference: 'EZ-ATE-0001', name: 'Sandales en cuir minimales', shopId: 'atelier-naya', category: 'chaussures', subcategory: 'femme', shoeGender: 'femme', price: 16500, images: [I.shoe1, I.shoe4], rating: 4.8, reviewCount: 22, stock: 10, variants: [{ name: 'Couleur', values: ['Camel', 'Noir'] }, { name: 'Taille', values: ['36', '37', '38', '39', '40'] }], description: 'Sandales fines en cuir, minimalistes.', details: [{ label: 'Matière', value: 'Cuir véritable' }, { label: 'Type', value: 'Sandales' }, { label: 'Semelle', value: 'Cuir' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isTrending: true, reviews: [r('r9', 'Ndèye T.', 5, '2026-06-30', 'Confortables dès la première fois.')] },
    
  // === CHAUSSURES — Homme ===
  { id: 'sneakers-homme-cuir', reference: 'EZ-ATE-0002', name: 'Sneakers homme cuir', shopId: 'atelier-naya', category: 'chaussures', subcategory: 'homme', shoeGender: 'homme', price: 24500, images: [I.shoe6, I.shoe5], rating: 4.7, reviewCount: 19, stock: 8, variants: [{ name: 'Couleur', values: ['Blanc', 'Noir', 'Gris'] }, { name: 'Taille', values: ['40', '41', '42', '43', '44', '45'] }], description: 'Sneakers en cuir, style minimaliste.', details: [{ label: 'Type', value: 'Sneakers' }, { label: 'Matière', value: 'Cuir véritable' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isTrending: true, reviews: [r('r32', 'Babacar N.', 5, '2026-07-15', 'Sneakers propres et solides.')] },
    { id: 'baskets-homme-sport', reference: 'EZ-MAI-0008', name: 'Baskets homme sport', shopId: 'maison-fatou', category: 'chaussures', subcategory: 'homme', shoeGender: 'homme', price: 19500, oldPrice: 25000, images: [I.shoe5, I.shoe7], rating: 4.3, reviewCount: 25, stock: 15, variants: [{ name: 'Couleur', values: ['Noir', 'Bleu marine', 'Gris'] }, { name: 'Taille', values: ['40', '41', '42', '43', '44', '45'] }], description: 'Baskets sport, semelle amortie.', details: [{ label: 'Type', value: 'Baskets' }, { label: 'Matière', value: 'Mesh + synthétique' }], delivery: D, isPromo: true, reviews: [r('r34', 'Pape D.', 4, '2026-07-12', 'Légères et confortables pour le sport.')] },

  // === SACS & MAROQUINERIE ===
  { id: 'sac-a-main-structure', reference: 'EZ-ATE-0003', name: 'Sac à main structuré', shopId: 'atelier-naya', category: 'sacs', subcategory: 'sacs-a-main', price: 24900, images: [I.bag1, I.bag3, I.bag7, I.bag8], rating: 4.7, reviewCount: 42, stock: 8, variants: [{ name: 'Couleur', values: ['Camel', 'Noir', 'Cognac'] }], description: 'Sac structuré en cuir véritable, format moyen.', details: [{ label: 'Matière', value: 'Cuir véritable' }, { label: 'Type', value: 'Sac à main' }, { label: 'Dimensions', value: '28 × 20 × 12 cm' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isTrending: true, reviews: [r('r5', 'Sokhna A.', 5, '2026-07-20', 'Cuir souple, finitions parfaites.'), r('r6', 'Aïcha M.', 4, '2026-06-15', 'Beau sac, juste un peu plus petit que prévu.')] },
  { id: 'sac-bandouliere-cuir', reference: 'EZ-ATE-0004', name: 'Sac bandoulière en cuir', shopId: 'atelier-naya', category: 'sacs', subcategory: 'sacs-bandouliere', price: 18500, oldPrice: 22000, images: [I.bag2, I.bag4], rating: 4.6, reviewCount: 27, stock: 5, variants: [{ name: 'Couleur', values: ['Noir', 'Beige', 'Marron'] }], description: 'Sac bandoulière compact, lanière réglable.', details: [{ label: 'Matière', value: 'Cuir véritable' }, { label: 'Type', value: 'Sac bandoulière' }, { label: 'Dimensions', value: '22 × 15 × 6 cm' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isPromo: true, reviews: [r('r7', 'Coumba F.', 5, '2026-07-05', 'Parfait pour sortir.')] },
  { id: 'pochette-soiree-doree', reference: 'EZ-ATE-0005', name: 'Pochette de soirée dorée', shopId: 'atelier-naya', category: 'sacs', subcategory: 'pochette', price: 12000, images: [I.bag3, I.bag5], rating: 4.5, reviewCount: 15, stock: 9, variants: [{ name: 'Couleur', values: ['Doré', 'Noir', 'Argenté'] }], description: 'Pochette élégante pour vos soirées.', details: [{ label: 'Type', value: 'Pochette' }, { label: 'Matière', value: 'Simili cuir' }], delivery: D, isNew: true, reviews: [r('r35', 'Aminata F.', 5, '2026-08-12', 'Pochette magnifique, parfaite pour les events.')] },
  { id: 'portefeuille-cuir-homme', reference: 'EZ-ATE-0006', name: 'Portefeuille cuir homme', shopId: 'atelier-naya', category: 'sacs', subcategory: 'portefeuilles', price: 9500, images: [I.bag4, I.bag6], rating: 4.6, reviewCount: 20, stock: 14, variants: [{ name: 'Couleur', values: ['Marron', 'Noir', 'Cognac'] }], description: 'Portefeuille en cuir, 8 emplacements cartes.', details: [{ label: 'Type', value: 'Portefeuille' }, { label: 'Matière', value: 'Cuir véritable' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isTrending: true, reviews: [r('r36', 'Serigne D.', 5, '2026-07-10', 'Portefeuille solide, belle finition.')] },
  { id: 'sac-a-dos-cuir-minimal', reference: 'EZ-ATE-0007', name: 'Sac à dos cuir minimal', shopId: 'atelier-naya', category: 'sacs', subcategory: 'sacs-a-dos', price: 28000, oldPrice: 34000, images: [I.bag6, I.bag1], rating: 4.7, reviewCount: 17, stock: 4, variants: [{ name: 'Couleur', values: ['Noir', 'Marron', 'Camel'] }], description: 'Sac à dos en cuir, design épuré.', details: [{ label: 'Type', value: 'Sac à dos' }, { label: 'Matière', value: 'Cuir véritable' }], delivery: D, isPromo: true, reviews: [r('r37', 'Ousmane B.', 5, '2026-07-25', 'Sac à dos élégant et pratique.')] },

  // === BEAUTÉ — Maquillage ===
  { id: 'palette-maquillage-nude', reference: 'EZ-DAK-0001', name: 'Palette maquillage nude', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'maquillage', price: 19500, images: [I.makeup2, I.makeup1, I.makeup7, I.makeup6], rating: 4.7, reviewCount: 41, stock: 7, variants: [{ name: 'Teinte', values: ['Nude', 'Warm', 'Deep'] }], description: 'Palette 12 teintes, finis mats et satinés.', details: [{ label: 'Zone', value: 'Yeux' }, { label: 'Type', value: 'Palette' }, { label: 'Teintes', value: '12' }, { label: 'Fini', value: 'Mat, Satiné' }], delivery: D, isNew: true, reviews: [r('r13', 'Rokhya N.', 5, '2026-08-01', 'Pigmentation superbe.')] },
    { id: 'fond-de-teint-veloute', reference: 'EZ-DAK-0002', name: 'Fond de teint velouté', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'maquillage', price: 14500, images: [I.makeup4, I.makeup1, I.makeup8, I.makeup6], rating: 4.6, reviewCount: 35, stock: 11, variants: [{ name: 'Teinte', values: ['Café', 'Moka', 'Caramel', 'Noisette'] }], description: 'Fond de teint couvrance modulable, fini velouté.', details: [{ label: 'Zone', value: 'Teint' }, { label: 'Type', value: 'Fond de teint' }, { label: 'Fini', value: 'Velouté' }], delivery: D, isTrending: true, reviews: [r('r38', 'Mame S.', 5, '2026-07-28', 'Couvrance parfaite pour ma peau.')] },
    
  // === BEAUTÉ — Skincare ===
  { id: 'serum-hydratant-visage', reference: 'EZ-DAK-0003', name: 'Sérum hydratant visage', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'skincare', price: 12500, images: [I.skincare1, I.skincare3, I.skincare7, I.skincare8], rating: 4.9, reviewCount: 58, stock: 14, variants: [{ name: 'Contenance', values: ['30 ml', '50 ml'] }], variantPrices: [{ conditions: { Contenance: '30 ml' }, price: 9500 }, { conditions: { Contenance: '50 ml' }, price: 12500 }], description: 'Sérum à l\'acide hyaluronique et vitamine E.', details: [{ label: 'Type de peau', value: 'Sèche, sensible' }, { label: 'Besoin', value: 'Hydratation' }, { label: 'Type de produit', value: 'Sérum' }, { label: 'Contenance', value: '50 ml' }], delivery: D, isTrending: true, reviews: [r('r10', 'Aminata D.', 5, '2026-07-22', 'Ma peau a changé en deux semaines.', true), r('r11', 'Khady S.', 5, '2026-07-10', 'Excellent sérum, pénètre vite.')] },
  { id: 'creme-anti-imperfections', reference: 'EZ-DAK-0004', name: 'Crème anti-imperfections', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'skincare', price: 14000, oldPrice: 17500, images: [I.skincare2, I.skincare4, I.skincare9, I.skincare7], rating: 4.6, reviewCount: 34, stock: 9, variants: [{ name: 'Contenance', values: ['40 ml'] }], description: 'Crème légère à la niacinamide.', details: [{ label: 'Type de peau', value: 'Mixte, grasse' }, { label: 'Besoin', value: 'Imperfections' }, { label: 'Type de produit', value: 'Crème' }], delivery: D, isPromo: true, reviews: [r('r12', 'Yacine B.', 4, '2026-07-15', 'Bonne crème, imperfections réduites.')] },
      
  // === BEAUTÉ — Soins capillaires ===
  { id: 'huile-cheveux-pousse', reference: 'EZ-DAK-0005', name: 'Huile cheveux pousse', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'soins-capillaires', price: 9500, images: [I.skincare5, I.hair5], rating: 4.6, reviewCount: 24, stock: 13, variants: [{ name: 'Contenance', values: ['60 ml', '100 ml'] }], variantPrices: [{ conditions: { Contenance: '60 ml' }, price: 9500 }, { conditions: { Contenance: '100 ml' }, price: 14000 }], description: 'Huile fortifiante pour stimuler la pousse.', details: [{ label: 'Besoin', value: 'Pousse, Anti-chute' }, { label: 'Type de produit', value: 'Huile' }], delivery: D, isTrending: true, reviews: [r('r44', 'Fama S.', 5, '2026-07-20', 'Mes cheveux ont poussé !')] },
  
  // === BEAUTÉ — Hygiène ===
    { id: 'deodorant-naturel', reference: 'EZ-DAK-0006', name: 'Déodorant naturel', shopId: 'dakar-beauty', category: 'beaute', subcategory: 'hygiene', price: 6500, images: [I.skincare6, I.skincare1], rating: 4.3, reviewCount: 12, stock: 10, variants: [{ name: 'Parfum', values: ['Citron', 'Lavande', 'Sans parfum'] }], description: 'Déodorant sans aluminium, 24h d\'efficacité.', details: [{ label: 'Besoin', value: 'Déodorant' }], delivery: D, isNew: true, reviews: [r('r47', 'Ndèye F.', 4, '2026-08-07', 'Déodorant efficace, naturel.')] },

  // === CHEVEUX — Perruques ===
  { id: 'perruque-body-wave-22', reference: 'EZ-HAI-0001', name: 'Perruque Body Wave 22"', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'perruques', texture: 'Body Wave', hairMaterial: 'Romance', price: 85000, oldPrice: 95000, images: [I.hair1, I.hair3, I.hair7, I.hair8], rating: 4.8, reviewCount: 36, stock: 4, variants: [{ name: 'Longueur', values: ['16"', '18"', '20"', '22"'] }, { name: 'Densité', values: ['150%', '180%', '200%'] }, { name: 'Couleur', values: ['Noir naturel', 'Brun', 'Chocolat'] }], variantPrices: [
    { conditions: { Longueur: '16"', Densité: '150%' }, price: 55000 },
    { conditions: { Longueur: '16"', Densité: '180%' }, price: 60000 },
    { conditions: { Longueur: '16"', Densité: '200%' }, price: 65000 },
    { conditions: { Longueur: '18"', Densité: '150%' }, price: 65000 },
    { conditions: { Longueur: '18"', Densité: '180%' }, price: 70000 },
    { conditions: { Longueur: '18"', Densité: '200%' }, price: 78000 },
    { conditions: { Longueur: '20"', Densité: '150%' }, price: 75000 },
    { conditions: { Longueur: '20"', Densité: '180%' }, price: 80000 },
    { conditions: { Longueur: '20"', Densité: '200%' }, price: 88000 },
    { conditions: { Longueur: '22"', Densité: '150%' }, price: 78000, oldPrice: 88000 },
    { conditions: { Longueur: '22"', Densité: '180%' }, price: 85000, oldPrice: 95000 },
    { conditions: { Longueur: '22"', Densité: '200%' }, price: 95000 },
  ], description: 'Perruque lace frontale, cheveux 100% naturels.', details: [{ label: 'Type', value: 'Lace frontal' }, { label: 'Cheveux', value: 'Romance' }, { label: 'Texture', value: 'Body Wave' }, { label: 'Matière', value: 'Romance' }], delivery: D, pickup: 'Retrait en studio · À partir de 24 h', isTrending: true, isPromo: true, reviews: [r('r15', 'Adja M.', 5, '2026-07-25', 'Rendu ultra naturel.', true), r('r16', 'Fama D.', 5, '2026-07-12', 'Qualité au top.')] },
    { id: 'perruque-curly-18', reference: 'EZ-HAI-0002', name: 'Perruque Curly 18"', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'perruques', texture: 'Curly', hairMaterial: 'Human Hair', price: 72000, oldPrice: 80000, images: [I.hair4, I.hair2, I.hair8, I.hair9], rating: 4.6, reviewCount: 15, stock: 2, variants: [{ name: 'Longueur', values: ['14"', '16"', '18"'] }, { name: 'Densité', values: ['180%', '200%'] }, { name: 'Couleur', values: ['Noir naturel', 'Chocolat'] }], variantPrices: [
    { conditions: { Longueur: '14"', Densité: '180%' }, price: 52000 },
    { conditions: { Longueur: '14"', Densité: '200%' }, price: 58000 },
    { conditions: { Longueur: '16"', Densité: '180%' }, price: 62000 },
    { conditions: { Longueur: '16"', Densité: '200%' }, price: 68000 },
    { conditions: { Longueur: '18"', Densité: '180%' }, price: 72000, oldPrice: 80000 },
    { conditions: { Longueur: '18"', Densité: '200%' }, price: 78000 },
  ], description: 'Perruque bouclée naturelle, lace frontale.', details: [{ label: 'Type', value: 'Lace frontal' }, { label: 'Cheveux', value: 'Human Hair' }, { label: 'Texture', value: 'Curly' }, { label: 'Matière', value: 'Human Hair' }], delivery: D, isPromo: true, reviews: [r('r49', 'Mariama D.', 5, '2026-07-28', 'Boucles superbes, look naturel.')] },
  { id: 'perruque-deep-wave-24', reference: 'EZ-HAI-0003', name: 'Perruque Deep Wave 24"', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'perruques', texture: 'Deep Wave', hairMaterial: 'Raw Hair', price: 95000, images: [I.hair2, I.hair4], rating: 4.9, reviewCount: 18, stock: 3, variants: [{ name: 'Longueur', values: ['18"', '20"', '22"', '24"'] }, { name: 'Densité', values: ['180%', '200%'] }, { name: 'Couleur', values: ['Noir naturel', 'Brun', 'Auburn'] }], variantPrices: [
    { conditions: { Longueur: '18"', Densité: '180%' }, price: 72000 },
    { conditions: { Longueur: '18"', Densité: '200%' }, price: 78000 },
    { conditions: { Longueur: '20"', Densité: '180%' }, price: 82000 },
    { conditions: { Longueur: '20"', Densité: '200%' }, price: 88000 },
    { conditions: { Longueur: '22"', Densité: '180%' }, price: 90000 },
    { conditions: { Longueur: '22"', Densité: '200%' }, price: 95000 },
    { conditions: { Longueur: '24"', Densité: '180%' }, price: 98000 },
    { conditions: { Longueur: '24"', Densité: '200%' }, price: 105000 },
  ], description: 'Perruque deep wave, raw hair premium.', details: [{ label: 'Type', value: 'Lace frontal' }, { label: 'Cheveux', value: 'Raw Hair' }, { label: 'Texture', value: 'Deep Wave' }, { label: 'Matière', value: 'Raw Hair' }], delivery: D, pickup: 'Retrait en studio · À partir de 24 h', isNew: true, reviews: [r('r50', 'Fama K.', 5, '2026-08-10', 'Qualité exceptionnelle.')] },

  // === CHEVEUX — Mèches ===
  { id: 'meches-naturelles-pre-tressees', reference: 'EZ-HAI-0004', name: 'Mèches naturelles pré-tressées', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'meches', texture: 'Straight', hairMaterial: 'Human Hair', price: 32000, images: [I.hair2, I.hair4], rating: 4.6, reviewCount: 19, stock: 15, variants: [{ name: 'Longueur', values: ['24"', '28"', '32"'] }, { name: 'Couleur', values: ['Noir naturel', 'Brun', 'Châtain'] }], description: 'Mèches pré-tressées prêtes à poser.', details: [{ label: 'Quantité', value: '6 packs / tête' }, { label: 'Texture', value: 'Straight' }, { label: 'Matière', value: 'Human Hair' }], delivery: D, reviews: [r('r17', 'Mame D.', 4, '2026-06-20', 'Bonne qualité, pose facile.')] },
  
  // === CHEVEUX — Blend Hair ===
  { id: 'blend-hair-kinky-curly', reference: 'EZ-HAI-0005', name: 'Blend Hair Kinky Curly 16"', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'blend-hair', texture: 'Kinky Curly', hairMaterial: 'Blend Hair', price: 25000, images: [I.hair5, I.hair6], rating: 4.4, reviewCount: 8, stock: 7, variants: [{ name: 'Longueur', values: ['12"', '14"', '16"'] }, { name: 'Couleur', values: ['Noir naturel', 'Chocolat'] }], description: 'Blend hair kinky curly, texture afro naturelle.', details: [{ label: 'Texture', value: 'Kinky Curly' }, { label: 'Matière', value: 'Blend Hair' }], delivery: D, isNew: true, reviews: [r('r52', 'Ndèye A.', 4, '2026-08-05', 'Texture afro top.')] },

  // === CHEVEUX — Cheveux naturels ===
  { id: 'cheveux-naturels-bundle-raw', reference: 'EZ-HAI-0006', name: 'Bundle Raw Hair 3 pièces', shopId: 'hair-studio-dakar', category: 'cheveux', subcategory: 'cheveux-naturels', texture: 'Straight', hairMaterial: 'Raw Hair', price: 65000, images: [I.hair6, I.hair5], rating: 4.8, reviewCount: 22, stock: 5, variants: [{ name: 'Longueur', values: ['16"', '18"', '20"', '22"', '24"'] }, { name: 'Couleur', values: ['Noir naturel', 'Brun'] }], variantPrices: [
    { conditions: { Longueur: '16"' }, price: 55000 },
    { conditions: { Longueur: '18"' }, price: 60000 },
    { conditions: { Longueur: '20"' }, price: 65000 },
    { conditions: { Longueur: '22"' }, price: 72000 },
    { conditions: { Longueur: '24"' }, price: 80000 },
  ], description: '3 bundles raw hair naturel, non traité.', details: [{ label: 'Texture', value: 'Straight' }, { label: 'Matière', value: 'Raw Hair' }, { label: 'Quantité', value: '3 bundles' }], delivery: D, isTrending: true, reviews: [r('r53', 'Oulèye M.', 5, '2026-07-22', 'Raw hair de très bonne qualité.')] },

  // === PARFUMS — Femme ===
  { id: 'parfum-femme-100ml', reference: 'EZ-AIS-0001', name: 'Parfum femme Élégance', shopId: 'maison-senteur', category: 'parfums', subcategory: 'parfums-femme', price: 32000, images: [I.perfume1, I.perfume3, I.perfume7, I.perfume8], rating: 4.8, reviewCount: 47, stock: 11, variants: [{ name: 'Volume', values: ['30 ml', '50 ml', '100 ml'] }], variantPrices: [
    { conditions: { Volume: '30 ml' }, price: 18000 },
    { conditions: { Volume: '50 ml' }, price: 25000 },
    { conditions: { Volume: '100 ml' }, price: 32000 },
  ], description: 'Sillage floral chaleureux, notes de cœur poudrées.', details: [
    { label: 'Famille olfactive', value: 'Floral' }, { label: 'Volume', value: '100 ml' }, { label: 'Tenue', value: '6–8 h' },
    { label: 'Notes de tête', value: 'Bergamote, fleur d\'oranger' },
    { label: 'Notes de cœur', value: 'Jasmin, rose' },
    { label: 'Notes de fond', value: 'Vanille, musc' },
  ], delivery: D, isTrending: true, reviews: [r('r18', 'Oulèye N.', 5, '2026-07-19', 'Sillage magnifique.')] },
  
  // === PARFUMS — Homme ===
  { id: 'parfum-homme-boise', reference: 'EZ-AIS-0002', name: 'Parfum homme Boisé Intense', shopId: 'maison-senteur', category: 'parfums', subcategory: 'parfums-homme', price: 30000, images: [I.perfume5, I.perfume1, I.perfume9, I.perfume10], rating: 4.7, reviewCount: 25, stock: 9, variants: [{ name: 'Volume', values: ['50 ml', '100 ml'] }], variantPrices: [
    { conditions: { Volume: '50 ml' }, price: 22000 },
    { conditions: { Volume: '100 ml' }, price: 30000 },
  ], description: 'Parfum boisé épicé, masculin et élégant.', details: [
    { label: 'Famille olfactive', value: 'Boisé' }, { label: 'Tenue', value: '8–10 h' },
    { label: 'Notes de tête', value: 'Pamplemousse, poivre noir' },
    { label: 'Notes de cœur', value: 'Cèdre, lavande' },
    { label: 'Notes de fond', value: 'Vétiver, ambre, cuir' },
  ], delivery: D, isTrending: true, reviews: [r('r55', 'Modou D.', 5, '2026-07-20', 'Sillage incroyable.')] },

  // === PARFUMS — Huiles & Brumes ===
  { id: 'brume-parfumee-fleur', reference: 'EZ-AIS-0003', name: 'Brume parfumée fleur de tiaré', shopId: 'maison-senteur', category: 'parfums', subcategory: 'huiles-brumes', price: 9500, images: [I.perfume2, I.perfume4], rating: 4.7, reviewCount: 23, stock: 18, variants: [{ name: 'Volume', values: ['100 ml', '250 ml', '500 ml'] }], variantPrices: [
    { conditions: { Volume: '100 ml' }, price: 9500 },
    { conditions: { Volume: '250 ml' }, price: 14500 },
    { conditions: { Volume: '500 ml' }, price: 22000 },
  ], description: 'Brume légère fleur de tiaré.', details: [
    { label: 'Type', value: 'Brume parfumée' }, { label: 'Famille olfactive', value: 'Floral' }, { label: 'Volume', value: '100 ml' },
    { label: 'Notes', value: 'Fleur de tiaré, monoï' },
  ], delivery: D, isNew: true, reviews: [r('r19', 'Astou D.', 5, '2026-08-05', 'Odeur délicieuse, fraîche.')] },
  
  // === PARFUMS — Encens & Parfums de maison ===
    { id: 'parfum-maison-amber', reference: 'EZ-AIS-0004', name: 'Parfum de maison Ambre & Santal', shopId: 'maison-senteur', category: 'parfums', subcategory: 'encens-parfums-maison', price: 15000, images: [I.perfume6, I.encens1], rating: 4.7, reviewCount: 14, stock: 6, variants: [{ name: 'Volume', values: ['100 ml', '250 ml'] }], variantPrices: [
    { conditions: { Volume: '100 ml' }, price: 15000 },
    { conditions: { Volume: '250 ml' }, price: 22000 },
  ], description: 'Parfum d\'intérieur ambre et santal, diffuse un chaud sillage.', details: [
    { label: 'Type', value: 'Parfum de maison' }, { label: 'Famille olfactive', value: 'Ambré' },
    { label: 'Notes', value: 'Ambre, santal, vanille' },
  ], delivery: D, isNew: true, reviews: [r('r57', 'Kiné M.', 5, '2026-08-11', 'Ma maison sent divinement bon.')] },

  // === BIJOUX & ACCESSOIRES ===
  { id: 'bracelet-plaque-or', reference: 'EZ-ATE-0008', name: 'Bracelet plaqué or', shopId: 'atelier-naya', category: 'bijoux', subcategory: 'bracelets', price: 15000, oldPrice: 18000, images: [I.jewelry1, I.jewelry2, I.jewelry7, I.jewelry8], rating: 4.7, reviewCount: 26, stock: 12, variants: [{ name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Bracelet fin plaqué or, fermoir sécurisé.', details: [{ label: 'Type', value: 'Bracelet' }, { label: 'Matière', value: 'Plaqué or' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isPromo: true, reviews: [r('r20', 'Kiné S.', 5, '2026-07-14', 'Bracelet délicat, brille bien.')] },
  { id: 'collier-plaque-or', reference: 'EZ-ATE-0009', name: 'Collier plaqué or', shopId: 'atelier-naya', category: 'bijoux', subcategory: 'colliers', price: 22000, images: [I.jewelry2, I.jewelry3, I.jewelry9, I.jewelry7], rating: 4.8, reviewCount: 33, stock: 6, variants: [{ name: 'Longueur', values: ['40 cm', '45 cm', '50 cm'] }, { name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Collier fin plaqué or, chaîne italienne.', details: [{ label: 'Type', value: 'Collier' }, { label: 'Matière', value: 'Plaqué or 18k' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isNew: true, reviews: [r('r21', 'Marième D.', 5, '2026-08-03', 'Chaîne fine et lumineuse.', true)] },
  { id: 'bagues-ensemble-perles', reference: 'EZ-ATE-0010', name: 'Ensemble bagues perles', shopId: 'atelier-naya', category: 'bijoux', subcategory: 'bagues', price: 12500, images: [I.jewelry4, I.jewelry5], rating: 4.5, reviewCount: 14, stock: 8, variants: [{ name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Set de 3 bagues fines ornées de perles.', details: [{ label: 'Type', value: 'Bague' }, { label: 'Matière', value: 'Perles, plaqué or' }], delivery: D, isNew: true, reviews: [r('r58', 'Awa F.', 4, '2026-08-09', 'Bagues délicates et jolies.')] },
  { id: 'boucles-oreilles-creoles', reference: 'EZ-ATE-0011', name: 'Boucles d\'oreilles créoles', shopId: 'atelier-naya', category: 'bijoux', subcategory: 'boucles-oreilles', price: 9500, images: [I.jewelry5, I.jewelry4], rating: 4.6, reviewCount: 18, stock: 10, variants: [{ name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Créoles fines en plaqué or, intemporelles.', details: [{ label: 'Type', value: 'Boucles d\'oreilles' }, { label: 'Matière', value: 'Plaqué or' }], delivery: D, pickup: 'Retrait en atelier · À partir de 4 h', isTrending: true, reviews: [r('r59', 'Ndèye B.', 5, '2026-07-26', 'Créoles parfaites, légères.')] },
  { id: 'bijou-taille-ceinture-doree', reference: 'EZ-ATE-0012', name: 'Bijou de taille ceinture dorée', shopId: 'atelier-naya', category: 'bijoux', subcategory: 'bijoux-de-taille', price: 18000, images: [I.jewelry6, I.jewelry1], rating: 4.5, reviewCount: 9, stock: 5, variants: [{ name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Ceinture bijou de taille, sublime vos tenues.', details: [{ label: 'Type', value: 'Bijou de taille' }, { label: 'Matière', value: 'Acier inoxydable plaqué or' }], delivery: D, isNew: true, reviews: [r('r60', 'Mariama T.', 5, '2026-08-12', 'Ceinture élégante, magnifique.')] },

  // === LINGERIE & NUIT ===
  { id: 'nuisette-satin-fleur', reference: 'EZ-MAI-0009', name: 'Nuisette satin fleur', shopId: 'maison-fatou', category: 'lingerie', subcategory: 'vetements-de-nuit', price: 14500, images: [I.lingerie1, I.lingerie2, I.lingerie5, I.lingerie6], rating: 4.6, reviewCount: 12, stock: 8, variants: [{ name: 'Couleur', values: ['Noir', 'Ivoire', 'Rose'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL'] }], description: 'Nuisette en satin fluide, dentelle fine.', details: [{ label: 'Type', value: 'Nuisette' }, { label: 'Matière', value: 'Satin, dentelle' }], delivery: D, isTrending: true, reviews: [r('r61', 'Awa D.', 5, '2026-07-20', 'Nuisette magnifique, satin doux.')] },
  { id: 'pyjama-femme-coton', reference: 'EZ-MAI-0010', name: 'Pyjama femme coton', shopId: 'maison-fatou', category: 'lingerie', subcategory: 'pyjamas', price: 16500, images: [I.lingerie3, I.lingerie4], rating: 4.5, reviewCount: 15, stock: 10, variants: [{ name: 'Couleur', values: ['Bleu marine', 'Rose pâle', 'Sable'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL', 'XXL'] }], description: 'Pyjama deux pièces en coton, doux et respirant.', details: [{ label: 'Type', value: 'Pyjama' }, { label: 'Matière', value: 'Coton 100%' }], delivery: D, isNew: true, reviews: [r('r62', 'Fatou M.', 4, '2026-08-06', 'Pyjama confortable, bonne taille.')] },
  { id: 'ensemble-lingerie-dentelle', reference: 'EZ-MAI-0011', name: 'Ensemble lingerie dentelle', shopId: 'maison-fatou', category: 'lingerie', subcategory: 'lingerie', price: 12000, oldPrice: 15000, images: [I.lingerie2, I.lingerie1], rating: 4.7, reviewCount: 20, stock: 7, variants: [{ name: 'Couleur', values: ['Noir', 'Bordeaux', 'Ivoire'] }, { name: 'Taille', values: ['XS', 'S', 'M', 'L', 'XL'] }], description: 'Ensemble lingerie en dentelle, soutien-gorge + culotte.', details: [{ label: 'Type', value: 'Soutien-gorge' }, { label: 'Matière', value: 'Dentelle, polyamide' }], delivery: D, isPromo: true, reviews: [r('r63', 'Aminata K.', 5, '2026-07-25', 'Ensemble très joli, belle finition.')] },
    { id: 'sous-vetements-coton-homme', reference: 'EZ-MAI-0012', name: 'Boxer coton homme (lot de 3)', shopId: 'maison-fatou', category: 'lingerie', subcategory: 'sous-vetements', price: 9500, images: [I.lingerie3, I.lingerie4], rating: 4.4, reviewCount: 22, stock: 15, variants: [{ name: 'Taille', values: ['S', 'M', 'L', 'XL', 'XXL'] }], description: 'Lot de 3 boxers en coton, confort et respirabilité.', details: [{ label: 'Type', value: 'Sous-vêtements' }, { label: 'Matière', value: 'Coton 95%' }], delivery: D, isTrending: true, reviews: [r('r65', 'Cheikh M.', 4, '2026-07-30', 'Bons boxers, coton confortable.')] },
];

export const productMap: Record<string, Product> = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Product>);
export const getProduct = (id: string): Product | undefined => productMap[id];
export const productsByCategory = (categoryId: string): Product[] => products.filter((p) => p.category === categoryId);
export const productsBySubcategory = (categoryId: string, subId: string): Product[] => products.filter((p) => p.category === categoryId && p.subcategory === subId);
export const productsByShop = (shopId: string): Product[] => products.filter((p) => p.shopId === shopId);

export function searchProducts(query: string): { products: Product[]; shops: Shop[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { products: [], shops: [] };
  const terms = q.split(/\s+/).filter(Boolean);
  const matchedProducts = products.filter((p) => {
    const haystack = [p.name, p.description, p.subcategory, p.category, ...p.variants.flatMap((v) => v.values), ...p.details.map((d) => `${d.label} ${d.value}`)].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const matchedShops = allShops.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  return { products: matchedProducts, shops: matchedShops };
}

export function formatFCFA(n: number): string { return `${n.toLocaleString('fr-FR')} FCFA`; }
export function discountPercent(price: number, oldPrice?: number): number | null {
  if (!oldPrice || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

export function getVariantPrice(product: Product, selected: Record<string, string>): { price: number; oldPrice?: number } {
  if (!product.variantPrices || product.variantPrices.length === 0) return { price: product.price, oldPrice: product.oldPrice };
  const match = product.variantPrices.find((vp) => Object.entries(vp.conditions).every(([key, val]) => selected[key] === val));
  if (match) return { price: match.price, oldPrice: match.oldPrice };
  return { price: product.price, oldPrice: product.oldPrice };
}

export function getProductsFromSameShop(product: Product): Product[] {
  return products.filter((p) => p.shopId === product.shopId && p.id !== product.id);
}

export function getSimilarProducts(product: Product, excludeIds: string[] = []): Product[] {
  const exclude = new Set([product.id, ...excludeIds]);
  const sameSub = products.filter((p) => !exclude.has(p.id) && p.category === product.category && p.subcategory === product.subcategory);
  const sameCat = products.filter((p) => !exclude.has(p.id) && p.category === product.category && p.subcategory !== product.subcategory);
  const priceMin = product.price * 0.5;
  const priceMax = product.price * 2;
  const similarPrice = products.filter((p) => !exclude.has(p.id) && p.category !== product.category && p.price >= priceMin && p.price <= priceMax);
  const scored = [...sameSub.map((p) => ({ p, score: 5 })), ...sameCat.map((p) => ({ p, score: 3 })), ...similarPrice.map((p) => ({ p, score: 1 }))];
  scored.sort((a, b) => b.score - a.score || (b.p.isTrending ? 1 : 0) - (a.p.isTrending ? 1 : 0));
  return scored.slice(0, 8).map((s) => s.p);
}
