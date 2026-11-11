// Texts of « Devenir vendeur » (/devenir-vendeur/) — single source for the
// React page (src/pages/BecomeSellerPage.tsx) and its static, crawlable
// version (scripts/seo/become-seller.mjs), so both always say the same thing.
// Plain JavaScript so Node can import it; types in becomeSeller.d.ts.
//
// Written for search engines (SEO), answer engines (AEO: questions answered
// in their first sentence, FAQPage markup) and generative engines (GEO:
// self-contained, factual sentences naming Ezial, Dakar, Sénégal, FCFA).
// Every number comes from plans.js / siteInfo.js; nothing here is invented —
// no statistics, testimonials or promised sales.
import {
  FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT,
  TRIAL_DAYS, PLUS_PLAN_NAME, PLUS_BILLING, TRIAL_RULES, CANCELLATION_RULES, formatFcfa,
} from './plans.js';
import { DELIVERY, LAUNCH_DATE_LABEL } from './siteInfo.js';

const plusPrice = `${formatFcfa(PLUS_BILLING.quarterly.priceFcfa)} tous les 3 mois ou ${formatFcfa(PLUS_BILLING.annual.priceFcfa)} par an`;

export const BECOME_SELLER_PATH = '/devenir-vendeur/';

export const BECOME_SELLER_META = {
  title: 'Vendre en ligne au Sénégal : créez votre boutique | Ezial',
  description: `Ouvrez votre boutique en ligne sur Ezial, la marketplace sénégalaise : Free sans abonnement ou ${PLUS_PLAN_NAME} avec ${TRIAL_DAYS} jours d’essai gratuit. Livraison à ${DELIVERY.area}.`,
};

export const BECOME_SELLER_HERO = {
  eyebrow: 'Vendre en ligne au Sénégal',
  title: 'Développez votre boutique avec Ezial.',
  text: 'Rejoignez une marketplace pensée pour les commerces sénégalais. Présentez vos produits, touchez de nouveaux clients et développez vos ventes en ligne.',
};

// « En bref » — a direct, quotable answer to « Comment vendre sur Ezial ? ».
export const BECOME_SELLER_SUMMARY = [
  `Ezial est une marketplace en ligne basée à ${DELIVERY.area}, au Sénégal, qui rassemble des boutiques sénégalaises sur un seul site.`,
  `Pour vendre sur Ezial, créez votre boutique, choisissez votre formule et publiez vos produits : Ezial organise la livraison de vos commandes à ${DELIVERY.area}.`,
  `Deux formules : Free, sans abonnement (${FREE_PRODUCT_LIMIT} produits publiés, ${FREE_COMMISSION_PERCENT} % de commission par vente), ou ${PLUS_PLAN_NAME} (${PREMIUM_PRODUCT_LIMIT} produits publiés, ${PREMIUM_COMMISSION_PERCENT} % de commission, ${plusPrice}), avec un essai gratuit de ${TRIAL_DAYS} jours.`,
];

/** icon: key of the icon used by the React page. */
export const BECOME_SELLER_BENEFITS = [
  { icon: 'eye', title: 'Plus de visibilité', text: 'Votre boutique est présentée aux clients qui parcourent Ezial : catalogue, recherche et catégories.' },
  { icon: 'store', title: 'Votre boutique en ligne', text: 'Une vitrine à votre nom : photos, descriptions, prix, tailles, couleurs et variantes.' },
  { icon: 'truck', title: 'Livraison organisée', text: `Ezial organise la collecte et la livraison de vos commandes à ${DELIVERY.area}.` },
  { icon: 'dashboard', title: 'Gestion simplifiée', text: 'Commandes, stocks, ventes et revenus suivis depuis un seul espace.' },
  { icon: 'handshake', title: 'Accompagnement', text: 'L’équipe Ezial vous aide à configurer votre boutique et à présenter vos produits.' },
];

export const BECOME_SELLER_MISSION_TAGLINE = 'La marketplace sénégalaise qui rassemble vos boutiques préférées.';

export const BECOME_SELLER_MISSION = [
  'Rendre les boutiques sénégalaises accessibles en ligne.',
  'Rassembler vos boutiques préférées sur une seule marketplace.',
  'Simplifier la commande et la livraison pour les clients.',
  'Offrir aux commerçants des outils simples pour vendre en ligne.',
  'Valoriser le savoir-faire et les créateurs locaux.',
];

export const BECOME_SELLER_STEPS = [
  { title: 'Créez votre compte', text: 'Inscrivez-vous, ou connectez-vous avec votre compte Ezial si vous en avez déjà un.' },
  { title: 'Créez votre boutique', text: 'Donnez-lui un nom, ajoutez votre logo et une description.' },
  { title: 'Choisissez votre formule', text: `Free ou ${PLUS_PLAN_NAME}, avec un essai gratuit de ${TRIAL_DAYS} jours.` },
  { title: 'Publiez vos produits', text: 'Mettez vos produits en ligne et recevez vos commandes.' },
];

// Questions sellers (and answer engines) actually ask. Each answer starts
// with the direct answer, then the detail.
export const BECOME_SELLER_FAQ = [
  {
    q: 'Comment vendre en ligne sur Ezial ?',
    a: `Créez un compte (ou utilisez votre compte Ezial), créez votre boutique, choisissez la formule Free ou ${PLUS_PLAN_NAME}, puis publiez vos produits. Vos produits apparaissent dans le catalogue, la recherche et les catégories d’Ezial, et vous recevez vos commandes dans votre espace vendeur.`,
  },
  {
    q: 'Combien coûte la vente sur Ezial ?',
    a: `Avec Free, il n’y a aucun abonnement : Ezial prélève ${FREE_COMMISSION_PERCENT} % de commission sur chaque vente. ${PLUS_PLAN_NAME} coûte ${plusPrice}, avec une commission réduite à ${PREMIUM_COMMISSION_PERCENT} % par vente.`,
  },
  {
    q: 'Combien de produits puis-je publier ?',
    a: `Jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés avec Free, et jusqu’à ${PREMIUM_PRODUCT_LIMIT} avec ${PLUS_PLAN_NAME}.`,
  },
  {
    q: `Comment fonctionne l’essai gratuit d’${PLUS_PLAN_NAME} ?`,
    a: `L’essai dure ${TRIAL_DAYS} jours et donne tous les avantages d’${PLUS_PLAN_NAME} (${PREMIUM_PRODUCT_LIMIT} produits, commission de ${PREMIUM_COMMISSION_PERCENT} %). ${TRIAL_RULES} Un essai activé avant le lancement officiel du ${LAUNCH_DATE_LABEL} commence à cette date.`,
  },
  {
    q: 'Que se passe-t-il à la fin de l’essai ?',
    a: `Sans abonnement, la boutique repasse automatiquement au forfait Free : ${FREE_PRODUCT_LIMIT} produits publiés au maximum et ${FREE_COMMISSION_PERCENT} % de commission sur les nouvelles ventes. Rien n’est prélevé sans votre accord, et vos produits, commandes et historique de ventes sont conservés ; vous choisissez les ${FREE_PRODUCT_LIMIT} produits qui restent en ligne.`,
  },
  {
    q: 'Faut-il un compte séparé pour vendre ?',
    a: 'Non. Le même compte Ezial sert à acheter et à vendre : « Mon compte » pour vos achats, « Ma boutique » pour votre espace vendeur.',
  },
  {
    q: 'Qui livre les commandes ?',
    a: `Ezial. Quand une commande est prête, un livreur Ezial vient la récupérer dans votre boutique et la livre au client à ${DELIVERY.area}, en ${DELIVERY.delay} (délai indicatif). Si vous le proposez, le client peut aussi la retirer en boutique avec son code de retrait.`,
  },
  {
    q: 'Comment suis-je payé ?',
    a: 'Depuis l’espace Finances de votre boutique : il affiche vos ventes, la commission Ezial et votre montant net, et vous y demandez le paiement de votre solde disponible.',
  },
  {
    q: `Puis-je résilier ${PLUS_PLAN_NAME} ?`,
    a: CANCELLATION_RULES,
  },
];

/** FAQPage structured data (schema.org) for the questions above. */
export function becomeSellerFaqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: BECOME_SELLER_FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
