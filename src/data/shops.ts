export interface Shop {
  id: string; name: string; banner: string; logo: string;
  followers: number; description: string; city: string; rating: number; reviewCount: number;
  address: string; pickupEnabled: boolean; pickupEta: string;
}

export const shops: Shop[] = [
  { id: 'maison-fatou', name: 'Maison Fatou', banner: 'https://images.pexels.com/photos/8743972/pexels-photo-8743972.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 12480, description: 'Mode féminine contemporaine & essentiels africains. Pièces sélectionnées avec soin à Dakar.', city: 'Dakar', rating: 4.8, reviewCount: 312, address: 'Plateau, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'dakar-beauty', name: 'Dakar Beauty', banner: 'https://images.pexels.com/photos/27781696/pexels-photo-27781696.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 8900, description: 'Skincare, maquillage & parfums. Une sélection beauty pensée pour les peaux métissées et noires.', city: 'Dakar', rating: 4.9, reviewCount: 428, address: 'Mermoz, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'atelier-naya', name: 'Atelier Naya', banner: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/6650009/pexels-photo-6650009.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 5630, description: 'Maroquinerie structurée & sacs d\'atelier. Cuir véritable, finitions à la main.', city: 'Dakar', rating: 4.7, reviewCount: 156, address: 'Almadies, Dakar', pickupEnabled: true, pickupEta: 'À partir de 4 h' },
  { id: 'maison-senteur', name: 'Maison Senteur', banner: 'https://images.pexels.com/photos/30405427/pexels-photo-30405427.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 4210, description: 'Parfums, brumes & encens. Des senteurs qui voyagent entre Dakar et le monde.', city: 'Dakar', rating: 4.8, reviewCount: 198, address: 'Point E, Dakar', pickupEnabled: false, pickupEta: 'À partir de 4 h' },
  { id: 'hair-studio-dakar', name: 'Hair Studio Dakar', banner: 'https://images.pexels.com/photos/13734819/pexels-photo-13734819.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', logo: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=200&w=200&fit=crop', followers: 9870, description: 'Perruques premium, mèches & Blend Hair. Qualité salon, livraison à domicile.', city: 'Dakar', rating: 4.6, reviewCount: 267, address: 'Sacré-Cœur, Dakar', pickupEnabled: true, pickupEta: 'À partir de 24 h' },
];

export const shopMap: Record<string, Shop> = shops.reduce((acc, s) => ({ ...acc, [s.id]: s }), {} as Record<string, Shop>);
export const getShop = (id: string): Shop | undefined => shopMap[id];
