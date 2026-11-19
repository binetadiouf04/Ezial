// Identity and contact details of Ezial — single source for the site and the
// static SEO build (plain JavaScript so Node can import it; types in
// siteInfo.d.ts). Never invent administrative data here: every value below
// was provided by the company.

export const SITE_URL = 'https://ezial.net';

export const COMPANY = {
  /** The company operating the Ezial marketplace. */
  name: 'Ezial',
  denomination: 'Ezial',
  tradeName: 'Ezial',
  legalForm: 'Entreprise individuelle',
  rccm: 'SN.DKR.2026.A.40238',
  ninea: '013246576',
  address: 'Grand Yoff, quartier Sicap Foire, villa n° 48, Dakar, Sénégal',
  /** Même adresse, sans la ville ni le pays (données structurées schema.org). */
  streetAddress: 'Grand Yoff, quartier Sicap Foire, villa n° 48',
  publicationManager: 'Bineta DIOUF',
  /** Mention imprimée sur les factures : la société n'est pas soumise à la TVA (précisé par la dirigeante le 19 nov. 2026). */
  vatNote: 'TVA non applicable',
};

export const CONTACT = {
  email: 'contact@ezial.net',
  phone: '+221 71 105 52 52',
  phoneHref: 'tel:+221711055252',
  city: 'Dakar, Sénégal',
};

// Official accounts are being created: replace each url with the account's
// address once it exists (the links stay in place meanwhile).
export const SOCIAL_LINKS = [
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/' },
  { id: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/' },
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/' },
];

// Delivery promise, shown prominently wherever delivery is mentioned.
export const DELIVERY = {
  delay: '4 à 48 h',
  area: 'Dakar',
  /** Frais de livraison minimum, en FCFA : identique à delivery_pricing_settings.minimum_fee (800) et à MIN_FEE de src/lib/deliveryEstimate.ts. */
  fromFee: 800,
  fromFeeLabel: '800 FCFA',
  promise: 'Livraison en 4 à 48 h à Dakar',
  /** Wording for legal pages: an indicative delay, not a guarantee. */
  legalNote: 'Ce délai est indicatif : il peut varier selon la disponibilité des produits, la zone de livraison et les conditions de circulation.',
};

// Official launch: trials activated before this date start counting from it.
export const LAUNCH_DATE_ISO = '2026-12-12';
export const LAUNCH_DATE_LABEL = '12 décembre 2026';

// Titres et descriptions de référence pour les moteurs de recherche. Source
// unique : index.html (texte recopié, vérifié par src/shared/seo.test.mjs), le
// site (src/lib/seoHead.ts, src/App.tsx) et le HTML statique
// (scripts/prerender-seo.mjs) en dépendent. Informations officielles (19 nov.
// 2026) : marketplace 100 % en ligne, plusieurs boutiques à Dakar, mode,
// beauté, parfumerie et accessoires, livraison dès 800 FCFA en 4 à 48 h.
// Ezial ne vend plus de cheveux : ils n'apparaissent dans aucune description.
export const SEO = {
  homeTitle: 'Ezial, mode, beauté et accessoires à Dakar',
  homeDescription: `Ezial, marketplace 100 % en ligne réunissant plusieurs boutiques à Dakar. Mode, beauté, parfumerie et accessoires. Livraison dès ${DELIVERY.fromFeeLabel} en ${DELIVERY.delay}.`,
};
