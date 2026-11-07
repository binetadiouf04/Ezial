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
  publicationManager: 'Bineta DIOUF',
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
  area: 'Dakar et environs',
  promise: 'Livraison en 4 à 48 h à Dakar et environs',
  /** Wording for legal pages: an indicative delay, not a guarantee. */
  legalNote: 'Ce délai est indicatif : il peut varier selon la disponibilité des produits, la zone de livraison et les conditions de circulation.',
};

// Official launch: trials activated before this date start counting from it.
export const LAUNCH_DATE_ISO = '2026-12-12';
export const LAUNCH_DATE_LABEL = '12 décembre 2026';
