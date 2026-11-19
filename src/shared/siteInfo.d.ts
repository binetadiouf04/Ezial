export const SITE_URL: string;
export const COMPANY: {
  name: string;
  denomination: string;
  tradeName: string;
  legalForm: string;
  rccm: string;
  ninea: string;
  address: string;
  streetAddress: string;
  publicationManager: string;
  vatNote: string;
};
export const CONTACT: { email: string; phone: string; phoneHref: string; city: string };
export const SOCIAL_LINKS: { id: 'instagram' | 'tiktok' | 'facebook'; label: string; url: string }[];
export const DELIVERY: { delay: string; area: string; fromFee: number; fromFeeLabel: string; promise: string; legalNote: string };
export const SEO: { homeTitle: string; homeDescription: string };
export const LAUNCH_DATE_ISO: string;
export const LAUNCH_DATE_LABEL: string;
