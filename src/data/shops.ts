export interface Shop {
  id: string; name: string; banner: string; logo: string;
  followers: number; description: string; city: string; rating: number; reviewCount: number;
  address: string; pickupEnabled: boolean; pickupEta: string;
  // From Supabase shops.is_official — never set on the static mock shops
  // below (always falsy there). Drives which shop's products are
  // prioritized on the Home (see src/lib/productRanking.ts).
  isOfficial?: boolean;
  // From Supabase shops.latitude/longitude — undefined for every static
  // mock shop below (they have no real-world coordinates) and for any
  // real shop that hasn't set its location yet in Ezial Pro. Used only to
  // mirror the backend's delivery-fee estimate before checkout; the
  // static mock shops here never resolve a distance-based estimate.
  latitude?: number;
  longitude?: number;
}

export const shops: Shop[] = [
  { id: 'maison-fatou', name: 'Maison Fatou', banner: 'https://images.pexels.com/photos/8743972/pexels-photo-8743972.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 12480, description: 'Mode féminine contemporaine & essentiels africains. Pièces sélectionnées avec soin à Dakar.', city: 'Dakar', rating: 4.8, reviewCount: 312, address: 'Plateau, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'dakar-beauty', name: 'Dakar Beauty', banner: 'https://images.pexels.com/photos/27781696/pexels-photo-27781696.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 8900, description: 'Skincare, maquillage & parfums. Une sélection beauty pensée pour les peaux métissées et noires.', city: 'Dakar', rating: 4.9, reviewCount: 428, address: 'Mermoz, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'atelier-naya', name: 'Atelier Naya', banner: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/6650009/pexels-photo-6650009.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 5630, description: 'Maroquinerie structurée & sacs d\'atelier. Cuir véritable, finitions à la main.', city: 'Dakar', rating: 4.7, reviewCount: 156, address: 'Almadies, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'maison-senteur', name: 'Maison Senteur', banner: 'https://images.pexels.com/photos/30405427/pexels-photo-30405427.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 4210, description: 'Parfums, brumes & encens. Des senteurs qui voyagent entre Dakar et le monde.', city: 'Dakar', rating: 4.8, reviewCount: 198, address: 'Point E, Dakar', pickupEnabled: false, pickupEta: 'À partir de 4 h' },
];

export const shopMap: Record<string, Shop> = shops.reduce((acc, s) => ({ ...acc, [s.id]: s }), {} as Record<string, Shop>);

// Shops resolved from Supabase at runtime (e.g. a real seller's shop),
// registered once a Supabase catalog fetch succeeds (see HomePage.tsx /
// supabaseCatalog.ts) — kept separate from the static mock `shops` array
// above so getShop() can resolve either without merging the two lists.
const supabaseShopMap: Record<string, Shop> = {};

export function registerSupabaseShops(fetchedShops: Shop[]): void {
  for (const shop of fetchedShops) supabaseShopMap[shop.id] = shop;
}

export const getShop = (id: string): Shop | undefined => shopMap[id] ?? supabaseShopMap[id];
