// Ezial's two seller plans — the single source of truth for every number and
// every sales text about them, shared by the React site (re-exported by
// src/data/subscriptionPlans.ts) and the static SEO build. Plain JavaScript
// so Node can import it; types in plans.d.ts.
//
// Server-side enforcement must hold the same numbers: enforce_product_limit()
// (10 / 30 products), create_order() (10 % / 8 % commission on every sale,
// promotions included — no other rate exists), subscription_plan_price().
//
// The paid plan is shown as "Ezial Plus"; its technical id stays 'pro' in the
// database and PREMIUM_* in code, unchanged for compatibility.

export const FREE_PRODUCT_LIMIT = 10;
export const PREMIUM_PRODUCT_LIMIT = 30;
export const FREE_COMMISSION_PERCENT = 10;
export const PREMIUM_COMMISSION_PERCENT = 8;
export const TRIAL_DAYS = 30;

/** Products of a shop featured in Ezial's advertising campaigns. */
export const FREE_AD_PRODUCTS_LABEL = '1';
export const PLUS_AD_PRODUCTS_LABEL = '2 à 3';

export const PLUS_PLAN_NAME = 'Ezial Plus';

// Display only — the amount actually charged is decided server-side by
// public.subscription_plan_price(), which must hold these same values.
export const PLUS_BILLING = {
  quarterly: { priceFcfa: 6000, months: 3 },
  annual: { priceFcfa: 20000, months: 12 },
};
export const PLUS_ANNUAL_REFERENCE_PRICE_FCFA = PLUS_BILLING.quarterly.priceFcfa * 4;
export const PLUS_ANNUAL_SAVINGS_FCFA = PLUS_ANNUAL_REFERENCE_PRICE_FCFA - PLUS_BILLING.annual.priceFcfa;
export const PLUS_ANNUAL_DISCOUNT_PERCENT = Math.round((PLUS_ANNUAL_SAVINGS_FCFA / PLUS_ANNUAL_REFERENCE_PRICE_FCFA) * 100);

export function formatFcfa(amount) {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

const plusPriceLabel = `${formatFcfa(PLUS_BILLING.quarterly.priceFcfa)} / 3 mois ou ${formatFcfa(PLUS_BILLING.annual.priceFcfa)} / an`;

// ---------- Sales texts (validated by the company) ----------
// Affirmative wording only: no "possibilité de…" for an advantage.

// Key facts of each plan, in display order, as listed on the pricing cards:
// `strong` is highlighted, `before` / `after` complete the line around it.
// The ids of the first Ezial Plus items match PLUS_HIGHLIGHTS below.
export const FREE_CARD_ITEMS = [
  { id: 'products', before: 'Jusqu’à ', strong: `${FREE_PRODUCT_LIMIT} produits`, after: ' publiés' },
  { id: 'commission', strong: `${FREE_COMMISSION_PERCENT} % de commission`, after: ' par vente' },
  { id: 'ads', strong: `${FREE_AD_PRODUCTS_LABEL} produit`, after: ' dans les publicités en ligne Ezial' },
  { id: 'shop', strong: 'Boutique personnalisée', after: ' : photos, descriptions, prix, tailles, couleurs et variantes' },
  { id: 'management', strong: 'Gestion des stocks et des commandes', after: ', tableau de bord des ventes et revenus' },
  { id: 'catalog', strong: 'Présence', after: ' dans le catalogue, les recherches et les catégories' },
  { id: 'noFee', strong: 'Aucun abonnement', after: ' à payer' },
];

export const PLUS_CARD_ITEMS = [
  { id: 'free', strong: 'Tous les avantages de Free' },
  { id: 'products', before: 'Jusqu’à ', strong: `${PREMIUM_PRODUCT_LIMIT} produits`, after: ' publiés' },
  { id: 'commission', strong: `${PREMIUM_COMMISSION_PERCENT} % de commission`, after: ` par vente, au lieu de ${FREE_COMMISSION_PERCENT} %` },
  { id: 'ads', strong: `${PLUS_AD_PRODUCTS_LABEL} produits`, after: ' dans les publicités en ligne Ezial' },
  { id: 'trending', before: 'Priorité dans la section ', strong: '« Tendances »', after: ' de l’accueil' },
  { id: 'hero', before: 'Mise en avant dans le ', strong: 'carrousel de l’accueil' },
  { id: 'content', strong: 'Création de contenu', after: ' : la boutique fait partie des contenus créés par Ezial' },
  { id: 'blog', strong: 'Blog Ezial', after: ' : la boutique peut être présentée dans nos articles' },
  { id: 'badge', strong: 'Badge Ezial Plus', after: ' sur la boutique' },
];

/** One card item as plain text. */
export function planCardItemLabel(item) {
  return `${item.before ?? ''}${item.strong}${item.after ?? ''}`;
}

/** The Free card items as plain text (static SEO build). */
export const FREE_BENEFITS = FREE_CARD_ITEMS.map(planCardItemLabel);

/** The four headline advantages of Ezial Plus. No longer rendered by the
 * React site; the static SEO build still lists their titles on the pricing
 * page, followed by PLUS_BENEFITS. */
export const PLUS_HIGHLIGHTS = [
  {
    id: 'products',
    value: String(PREMIUM_PRODUCT_LIMIT),
    title: `${PREMIUM_PRODUCT_LIMIT} produits publiés`,
    text: `Trois fois plus qu’avec Free (${FREE_PRODUCT_LIMIT} produits). Présentez toute votre collection, vos nouveautés et tous vos modèles.`,
  },
  {
    id: 'commission',
    value: `${PREMIUM_COMMISSION_PERCENT} %`,
    title: `${PREMIUM_COMMISSION_PERCENT} % de commission`,
    text: `Au lieu de ${FREE_COMMISSION_PERCENT} % avec Free, sur chaque vente. Sur 100 000 FCFA de ventes : 8 000 FCFA de commission au lieu de 10 000 FCFA.`,
  },
  {
    id: 'ads',
    value: PLUS_AD_PRODUCTS_LABEL,
    title: 'Plus de produits dans nos publicités en ligne',
    text: `Ezial fait la promotion de toutes ses boutiques. Dans nos campagnes publicitaires en ligne, une boutique Ezial Plus présente ${PLUS_AD_PRODUCTS_LABEL} produits, contre ${FREE_AD_PRODUCTS_LABEL} pour une boutique Free.`,
    note: 'Calendrier, format et budget des campagnes fixés par Ezial ; résultats non garantis.',
  },
];

/** The Ezial Plus card items not covered by PLUS_HIGHLIGHTS, as plain text
 * (static SEO build: highlight titles + these = the whole card). */
export const PLUS_BENEFITS = PLUS_CARD_ITEMS
  .filter((item) => !PLUS_HIGHLIGHTS.some((h) => h.id === item.id))
  .map(planCardItemLabel);

/** Free vs Ezial Plus. A boolean renders as ✓ / —. */
export const PLAN_COMPARISON = [
  { label: 'Prix', free: 'Gratuit', plus: plusPriceLabel },
  { label: 'Produits publiés', free: String(FREE_PRODUCT_LIMIT), plus: String(PREMIUM_PRODUCT_LIMIT) },
  { label: 'Commission par vente', free: `${FREE_COMMISSION_PERCENT} %`, plus: `${PREMIUM_COMMISSION_PERCENT} %` },
  { label: 'Produits dans les publicités en ligne Ezial', free: FREE_AD_PRODUCTS_LABEL, plus: PLUS_AD_PRODUCTS_LABEL },
  { label: 'Priorité dans la section « Tendances » de l’accueil', free: false, plus: true },
  { label: 'Mise en avant dans le carrousel de l’accueil', free: false, plus: true },
  { label: 'Création de contenu par Ezial', free: false, plus: true },
  { label: 'Présentation dans le blog Ezial', free: false, plus: true },
  { label: 'Badge Ezial Plus', free: false, plus: true },
  { label: 'Essai gratuit', free: false, plus: `${TRIAL_DAYS} jours` },
];

export const PLUS_SAME_BENEFITS_NOTE = 'Les avantages sont identiques en formule trimestrielle ou annuelle.';

export const TRIAL_RULES = `Une seule période d’essai de ${TRIAL_DAYS} jours par boutique, sans paiement ni numéro Wave ou Orange Money.`;
export const PLAN_END_RULES = `À la fin de l’essai sans abonnement, la boutique repasse au forfait Free. Après un abonnement payé, elle conserve ses données et ses produits ; jusqu’au renouvellement, elle est soumise aux limites de Free (${FREE_PRODUCT_LIMIT} produits publiés, commission de ${FREE_COMMISSION_PERCENT} %).`;

// Résiliation : toujours possible, jamais remboursée, l'abonnement payé court
// jusqu'à son terme (texte repris par la politique de résiliation, les
// conditions, les tarifs vendeurs et l'espace « Mon abonnement »).
export const CANCELLATION_RULES = `Vous pouvez résilier ${PLUS_PLAN_NAME} à tout moment depuis l’espace « Mon abonnement ». La résiliation ne donne lieu à aucun remboursement : l’abonnement déjà payé reste actif jusqu’à la fin de la durée prévue, puis il n’est pas renouvelé et la boutique repasse au forfait Free.`;
