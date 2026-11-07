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

export const FREE_BENEFITS = [
  `Jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés`,
  'Boutique personnalisée',
  'Photos et descriptions de produits',
  'Gestion des prix, tailles, couleurs et variantes',
  'Gestion des stocks',
  'Réception et suivi des commandes',
  'Tableau de bord des ventes et revenus',
  'Présence dans le catalogue, les recherches et les catégories',
  `${FREE_AD_PRODUCTS_LABEL} produit mis en avant dans les publicités Ezial`,
  'Aucun abonnement à payer',
];

/** The four headline advantages of Ezial Plus, shown as highlighted cards. */
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
    text: `Au lieu de ${FREE_COMMISSION_PERCENT} % avec Free, sur chaque vente, même pendant vos promotions. Sur 100 000 FCFA de ventes : 8 000 FCFA de commission au lieu de 10 000 FCFA.`,
  },
  {
    id: 'ads',
    value: PLUS_AD_PRODUCTS_LABEL,
    title: 'Plus de produits dans nos publicités',
    text: `Ezial fait la promotion de toutes ses boutiques. Dans nos campagnes publicitaires, une boutique Ezial Plus présente ${PLUS_AD_PRODUCTS_LABEL} produits, contre ${FREE_AD_PRODUCTS_LABEL} pour une boutique Free.`,
    note: 'Calendrier, format et budget des campagnes fixés par Ezial ; résultats non garantis.',
  },
  {
    id: 'editorial',
    value: '★',
    title: 'Accès à la Sélection Ezial',
    text: 'Les recommandations mises en avant par Ezial sur la marketplace sont réservées aux boutiques Ezial Plus.',
    note: 'Les produits sont choisis par l’équipe Ezial selon leur pertinence et leur disponibilité.',
  },
];

/** Secondary advantages, listed under the highlights. */
export const PLUS_BENEFITS = [
  'Tous les avantages de Free',
  'Badge Ezial Plus sur la boutique',
  `Essai gratuit de ${TRIAL_DAYS} jours`,
];

/** Free vs Ezial Plus. A boolean renders as ✓ / —. */
export const PLAN_COMPARISON = [
  { label: 'Prix', free: 'Gratuit', plus: plusPriceLabel },
  { label: 'Produits publiés', free: String(FREE_PRODUCT_LIMIT), plus: String(PREMIUM_PRODUCT_LIMIT) },
  { label: 'Commission par vente', free: `${FREE_COMMISSION_PERCENT} %`, plus: `${PREMIUM_COMMISSION_PERCENT} %` },
  { label: 'Produits dans les publicités Ezial', free: FREE_AD_PRODUCTS_LABEL, plus: PLUS_AD_PRODUCTS_LABEL },
  { label: 'Sélection Ezial (recommandations)', free: false, plus: true },
  { label: 'Badge Ezial Plus', free: false, plus: true },
  { label: 'Essai gratuit', free: false, plus: `${TRIAL_DAYS} jours` },
];

export const PLUS_SAME_BENEFITS_NOTE = 'Les avantages sont identiques en formule trimestrielle ou annuelle.';

export const TRIAL_RULES = `Une seule période d’essai de ${TRIAL_DAYS} jours par boutique, sans paiement ni numéro Wave ou Orange Money.`;
export const TRIAL_PRELAUNCH_NOTE = `Essai activé avant le lancement officiel du 12 décembre 2026 : vos ${TRIAL_DAYS} jours d’essai commencent le 12 décembre. En attendant, vous pouvez déjà publier vos produits et profiter des avantages Ezial Plus.`;
export const PLAN_END_RULES = `À la fin de l’essai sans abonnement, la boutique repasse au forfait Free. Après un abonnement payé, elle conserve ses données et ses produits ; jusqu’au renouvellement, elle est soumise aux limites de Free (${FREE_PRODUCT_LIMIT} produits publiés, commission de ${FREE_COMMISSION_PERCENT} %).`;
