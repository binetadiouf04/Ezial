// Adresse publique d'une boutique — code pur (aucun accès réseau), testé par
// src/lib/shopUrl.test.mjs.
//
// Une boutique est joignable par son nom court (shops.slug, unique, attribué à
// la création : /boutique/tiass-brand/) ou par son identifiant
// (/boutique/<uuid>/, anciens liens). Le nom court est l'adresse à partager et
// l'adresse canonique déclarée aux moteurs de recherche.

type ShopUrlFields = { id: string; slug?: string | null };

/** Clé utilisée dans l'adresse : le nom court, à défaut l'identifiant. */
export function shopKey(shop: ShopUrlFields): string {
  return shop.slug || shop.id;
}

/** Route dans l'application (sans barre finale, comme les autres routes). */
export function shopPath(shop: ShopUrlFields): string {
  return `/boutique/${shopKey(shop)}`;
}

/** Adresse telle que servie et déclarée canonique (barre finale, comme la page statique générée au build). */
export function shopPublicPath(shop: ShopUrlFields): string {
  return `${shopPath(shop)}/`;
}

/** Retrouve une boutique d'après la clé lue dans l'adresse : nom court ou identifiant. */
export function findShopByKey<T extends ShopUrlFields>(shops: Iterable<T>, key: string): T | undefined {
  let bySlug: T | undefined;
  for (const s of shops) {
    if (s.id === key) return s;
    if (!bySlug && s.slug && s.slug === key) bySlug = s;
  }
  return bySlug;
}

/** Lien complet à partager (base = adresse du site, sans barre finale). */
export function shopShareUrl(shop: ShopUrlFields, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${shopPublicPath(shop)}`;
}

export interface ShopShareTexts {
  /** Court : tient dans la bio Instagram (150 caractères maximum, lien compris). */
  bio: string;
  /** Légende de publication ou de story. */
  post: string;
  /** Message prêt à envoyer par WhatsApp. */
  whatsapp: string;
}

/** Textes prêts à copier. Aucune promesse non vérifiée : ils renvoient seulement vers la boutique sur Ezial. */
export function shopShareTexts(shopName: string, url: string): ShopShareTexts {
  const name = shopName.trim();
  return {
    bio: `Commandez ${name} en ligne sur Ezial 👇\n${url}`,
    post: `${name} est sur Ezial 🛍️\nDécouvrez la boutique et commandez directement en ligne : ${url}`,
    whatsapp: `Bonjour ! Retrouvez ${name} sur Ezial et commandez directement en ligne : ${url}`,
  };
}
