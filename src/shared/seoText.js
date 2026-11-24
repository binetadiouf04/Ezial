// Descriptions des pages publiques qui n'ont pas de texte propre (catégories,
// sous-catégories, liste des boutiques, produit ou boutique sans description,
// pages utilitaires). Partagées par le site (src/App.tsx) et le HTML statique
// (scripts/prerender-seo.mjs) : un robot qui exécute le JavaScript lit le même
// texte que celui du HTML initial. JavaScript simple pour que Node l'importe.
//
// Chaque description nomme la page (catégorie, boutique, produit...) : aucune
// n'est identique à une autre. Les titres propres aux produits, catégories et
// boutiques ne sont pas ici : ils restent ceux de chaque page.
import { DELIVERY } from './siteInfo.js';

export const DESCRIPTION_MAX = 160;

/** Coupe à 160 caractères au dernier mot entier, avec « … ». */
export function clipDescription(text, max = DESCRIPTION_MAX) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(' '));
  return `${atWord.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

const DELIVERY_SENTENCE = `Livraison dès ${DELIVERY.fromFeeLabel} en ${DELIVERY.delay}.`;

export function categoryDescription(categoryLabel, subLabel) {
  return clipDescription(subLabel
    ? `${subLabel} (${categoryLabel}) à ${DELIVERY.area} sur Ezial : plusieurs boutiques, un seul panier. ${DELIVERY_SENTENCE}`
    : `${categoryLabel} à ${DELIVERY.area} sur Ezial, marketplace 100 % en ligne : découvrez les produits de plusieurs boutiques. ${DELIVERY_SENTENCE}`);
}

// Catégories dont le libellé de menu ne suffit pas comme titre de page :
// « Autres » seul ne dit rien à un moteur de recherche ni à un lecteur.
// Le menu garde le libellé court ; le titre, le H1 et la description
// utilisent ces textes (site et HTML statique).
export const CATEGORY_HEADINGS = {
  autres: 'Autres articles',
};

const CATEGORY_DESCRIPTIONS = {
  autres: `Autres articles à acheter en ligne à ${DELIVERY.area} sur Ezial : produits hors catégories des boutiques du Sénégal. ${DELIVERY_SENTENCE}`,
};

/** Titre de page (H1) d'une catégorie : son libellé, sauf exception ci-dessus. */
export function categoryHeading(categoryId, categoryLabel) {
  return CATEGORY_HEADINGS[categoryId] ?? categoryLabel;
}

/**
 * Titre (<title>) d'une page catégorie ou sous-catégorie, 60 caractères au
 * plus : « Sous-catégorie — Catégorie au Sénégal | Ezial », ou sans le nom
 * de la catégorie quand l'ensemble dépasserait 60 caractères.
 */
export function categoryPageTitle(heading, subLabel, siteTitle = 'Ezial') {
  if (!subLabel) return `${heading} au Sénégal | ${siteTitle}`;
  const full = `${subLabel} — ${heading} au Sénégal | ${siteTitle}`;
  return full.length <= 60 ? full : `${subLabel} au Sénégal | ${siteTitle}`;
}

/** Description d'une catégorie (sans sous-catégorie) ou d'une sous-catégorie, selon son identifiant. */
export function categoryDescriptionFor(categoryId, categoryLabel, subLabel) {
  if (!subLabel && CATEGORY_DESCRIPTIONS[categoryId]) return clipDescription(CATEGORY_DESCRIPTIONS[categoryId]);
  return categoryDescription(categoryHeading(categoryId, categoryLabel), subLabel);
}

/**
 * Meta description d'un produit ou d'une boutique à partir de son texte :
 * toujours sur une seule ligne (les retours à la ligne de la description
 * deviennent des espaces) et coupée à 160 caractères au dernier mot entier.
 */
export function oneLineDescription(text, fallback) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value ? clipDescription(value) : fallback;
}

/**
 * Découpe un texte saisi (description produit) en paragraphes : une ligne
 * vide sépare deux paragraphes ; un simple retour à la ligne est gardé dans
 * le paragraphe (affiché avec whitespace-pre-line ou <br>). Aucun HTML.
 */
export function textParagraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\s+|\s+$/g, '').replace(/[ \t]+\n/g, '\n'))
    .filter((p) => p.trim() !== '');
}

export function productFallbackDescription(name) {
  return clipDescription(`${name} sur Ezial, marketplace 100 % en ligne à ${DELIVERY.area}. ${DELIVERY_SENTENCE}`);
}

export function shopFallbackDescription(name) {
  return clipDescription(`Découvrez la boutique ${name} sur Ezial, marketplace 100 % en ligne à ${DELIVERY.area}. ${DELIVERY_SENTENCE}`);
}

export const SHOPS_INDEX_DESCRIPTION = clipDescription(
  `Les boutiques d'Ezial, marketplace 100 % en ligne à ${DELIVERY.area} : mode, beauté, parfumerie et accessoires. ${DELIVERY_SENTENCE}`,
);

// Pages sans adresse propre pour les moteurs de recherche (panier, compte,
// suivi...) : leur balise canonique pointe vers l'accueil. Chacune a quand même
// sa description. Aucune ne parle de moyens de paiement : le paiement en ligne
// est décrit uniquement sur sa page (/info/paiement/).
export const UTILITY_DESCRIPTIONS = {
  panier: clipDescription(`Votre panier Ezial : vérifiez les articles de plusieurs boutiques avant de commander. ${DELIVERY_SENTENCE}`),
  commande: 'Finalisez votre commande sur Ezial : vos coordonnées, la livraison ou le retrait en boutique, puis le récapitulatif avant confirmation.',
  confirmation: 'Votre commande Ezial est enregistrée : retrouvez son récapitulatif, son numéro et le suivi de la livraison.',
  suivi: 'Suivez votre commande Ezial étape par étape : préparation, livraison ou retrait en boutique.',
  detailCommande: 'Le détail de votre commande Ezial : articles, boutiques, livraison, paiement et facture.',
  favoris: 'Vos produits favoris sur Ezial, la marketplace 100 % en ligne de plusieurs boutiques à Dakar.',
  compte: 'Votre compte Ezial : commandes, favoris, adresses et informations personnelles.',
  recherche: 'Recherchez un produit ou une boutique parmi la mode, la beauté, la parfumerie et les accessoires d\'Ezial à Dakar.',
  promos: 'Promotions Ezial : les offres en cours des boutiques de Dakar sur la mode, la beauté, la parfumerie et les accessoires.',
  tendances: 'Tendances Ezial : les produits les plus aimés des clients parmi les boutiques de Dakar.',
  pourVous: 'Une sélection de produits Ezial choisie selon vos envies, parmi les boutiques de Dakar.',
  pro: "L'espace privé des administrateurs, vendeurs et livreurs de la marketplace Ezial.",
};
