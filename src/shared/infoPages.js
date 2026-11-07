// Institutional pages (/info/<slug>/): titles, meta descriptions and bodies,
// shared by the React site (src/pages/InfoPage.tsx) and the static SEO build
// (scripts/seo/info.mjs). Plain JavaScript so Node can import it; types in
// infoPages.d.ts.
//
// A page body is restricted Markdown (src/shared/markdown.js). A line made
// only of {{block-id}} inserts the structured block page.blocks[block-id]
// (cards, numbered steps, delivery highlight, pricing components...), rendered
// by React and by the static build alike.
//
// Never invent anything here: every statement comes from the company's
// validated texts, from siteInfo.js / plans.js, or from the way the site
// really works (checked in the code). Anchor links between pages use
// ?section=<heading id> (a #fragment is read as a legacy route by the SPA).

import { COMPANY, CONTACT, DELIVERY, SITE_URL } from './siteInfo.js';
import {
  FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, TRIAL_DAYS,
  PLUS_PLAN_NAME, PLUS_BILLING, PLUS_ANNUAL_REFERENCE_PRICE_FCFA, PLUS_ANNUAL_DISCOUNT_PERCENT,
  PLUS_SAME_BENEFITS_NOTE, TRIAL_RULES, TRIAL_PRELAUNCH_NOTE, PLAN_END_RULES, formatFcfa,
} from './plans.js';
import { parseMarkdown } from './markdown.js';

const LEGAL_UPDATED = '6 novembre 2026';
const LEGAL_UPDATED_ISO = '2026-11-06';

const QUARTERLY = formatFcfa(PLUS_BILLING.quarterly.priceFcfa);
const ANNUAL = formatFcfa(PLUS_BILLING.annual.priceFcfa);
const ANNUAL_REFERENCE = formatFcfa(PLUS_ANNUAL_REFERENCE_PRICE_FCFA);
const EMAIL_LINK = `[${CONTACT.email}](mailto:${CONTACT.email})`;
const PHONE_LINK = `[${CONTACT.phone}](${CONTACT.phoneHref})`;
const EXAMPLE_SALE = 50000;
const exampleCommission = (percent) => formatFcfa((EXAMPLE_SALE * percent) / 100);

const PAYMENT_ACTIVATION = 'Le paiement en ligne par Wave et Orange Money est en cours d’activation.';
const DELIVERY_LEGAL = `Ezial vise une livraison en 4 à 48 heures à ${DELIVERY.area}. ${DELIVERY.legalNote}`;

// ---------- reusable blocks ----------

const deliveryHighlight = {
  type: 'highlight',
  tone: 'delivery',
  title: `Livraison en ${DELIVERY.delay}`,
  text: `À ${DELIVERY.area}, ou retrait en boutique lorsque la boutique le propose.`,
};

const contactCards = (withAddress) => ({
  type: 'cards',
  columns: withAddress ? 3 : 2,
  items: [
    { icon: 'mail', title: 'Email', text: EMAIL_LINK },
    { icon: 'phone', title: 'Téléphone', text: PHONE_LINK },
    ...(withAddress ? [{ icon: 'map', title: 'Adresse', text: COMPANY.address }] : []),
  ],
});

// ---------- pages ----------

const aPropos = {
  slug: 'a-propos',
  layout: 'simple',
  title: 'À propos d’Ezial',
  breadcrumb: 'À propos',
  metaTitle: 'À propos — Ezial',
  description: 'Ezial, marketplace sénégalaise de mode et de beauté : des boutiques et créateurs du Sénégal, un seul panier, une livraison en 4 à 48 h à Dakar.',
  intro: 'Ezial est une marketplace sénégalaise dédiée à la mode et à la beauté. Elle réunit sur un même site des boutiques et des créateurs du Sénégal, pour que chacun puisse découvrir leurs produits, commander simplement et être livré à Dakar et dans ses environs.',
  jsonLdType: 'AboutPage',
  blocks: {
    categories: {
      type: 'cards',
      columns: 4,
      compact: true,
      items: [
        { icon: 'shirt', title: 'Vêtements', href: '/categorie/vetements/' },
        { icon: 'footprints', title: 'Chaussures', href: '/categorie/chaussures/' },
        { icon: 'bag', title: 'Sacs', href: '/categorie/sacs/' },
        { icon: 'gem', title: 'Bijoux', href: '/categorie/bijoux/' },
        { icon: 'sparkles', title: 'Produits de beauté', href: '/categorie/beaute/' },
        { icon: 'spray', title: 'Parfums', href: '/categorie/parfums/' },
        { icon: 'heart', title: 'Lingerie', href: '/categorie/lingerie/' },
        { icon: 'scissors', title: 'Tissus', href: '/categorie/tissus/' },
      ],
    },
    experience: {
      type: 'cards',
      columns: 4,
      items: [
        { icon: 'cart', title: 'Plusieurs boutiques, un seul panier', text: 'Réunissez les articles de plusieurs boutiques dans un même panier et passez une seule commande.' },
        { icon: 'truck', title: `Livraison en ${DELIVERY.delay}`, text: `À ${DELIVERY.area}, ou retrait en boutique lorsque la boutique le propose.`, emphasis: true },
        { icon: 'smartphone', title: 'Paiement mobile', text: `Wave ou Orange Money. ${PAYMENT_ACTIVATION}` },
        { icon: 'package', title: 'Suivi de commande', text: 'Chaque étape de votre commande est visible depuis votre compte.' },
      ],
    },
    vendeurs: {
      type: 'links',
      items: [
        { label: 'Voir les tarifs vendeurs', href: '/info/tarifs-vendeurs/', primary: true },
        { label: 'Comment vendre sur Ezial', href: '/info/comment-ca-marche/?section=pour-vendre' },
      ],
    },
    contact: contactCards(false),
  },
  markdown: `## Notre mission

Donner de la visibilité au savoir-faire et aux boutiques du Sénégal, et rendre l’achat de mode et de beauté en ligne plus simple et plus transparent.

## Ce que vous trouvez sur Ezial

Des vêtements, des chaussures, des sacs, des bijoux, des produits de beauté, des parfums, de la lingerie et des tissus, proposés par des boutiques et des créateurs du Sénégal.

{{categories}}

Le catalogue s’enrichit au fur et à mesure que de nouvelles boutiques rejoignent Ezial.

## Une expérience d’achat pensée pour vous

{{experience}}

## Pour les vendeurs

Ezial permet aux boutiques de vendre en ligne sans créer leur propre site : catalogue, commandes, livraison et suivi des ventes sont réunis dans un espace vendeur. Deux formules : **Free**, gratuite, et **${PLUS_PLAN_NAME}**.

{{vendeurs}}

## Nous contacter

Une question, une suggestion ? Écrivez-nous ou appelez-nous.

{{contact}}`,
};

const commentCaMarche = {
  slug: 'comment-ca-marche',
  layout: 'simple',
  title: 'Comment ça marche',
  metaTitle: 'Comment ça marche — Ezial',
  description: 'Acheter ou vendre sur Ezial, étape par étape : panier multi-boutiques, livraison en 4 à 48 h à Dakar, paiement Wave ou Orange Money, espace vendeur.',
  intro: 'Ezial réunit des boutiques de mode et de beauté du Sénégal sur un même site. Voici comment acheter, et comment vendre, en quelques étapes.',
  blocks: {
    livraison: deliveryHighlight,
    acheter: {
      type: 'steps',
      items: [
        { title: 'Découvrez les boutiques', text: 'Parcourez les catégories, utilisez la recherche ou rendez-vous directement sur la page d’une boutique.' },
        { title: 'Composez votre panier', text: 'Choisissez la taille, la couleur ou la variante de chaque article. Les articles de plusieurs boutiques sont réunis dans une seule commande.' },
        { title: 'Choisissez la livraison ou le retrait', text: `**Livraison en ${DELIVERY.delay}** à ${DELIVERY.area} : les frais sont calculés selon la distance et affichés avant la validation. Lorsque la boutique le propose, retirez votre commande sur place.` },
        { title: 'Réglez votre commande', text: `Choisissez Wave ou Orange Money. Un récapitulatif complet s’affiche avant la confirmation. ${PAYMENT_ACTIVATION}` },
        { title: 'Suivez votre commande', text: 'Suivez chaque étape depuis votre compte. En cas de souci, signalez un problème directement depuis la commande.' },
      ],
    },
    cadeau: {
      type: 'cards',
      columns: 1,
      items: [
        { icon: 'gift', title: 'Une commande à offrir ?', text: 'Cochez « Cette commande est un cadeau » : indiquez le nom et le téléphone du destinataire, ajoutez un petit mot et, si vous le souhaitez, un emballage cadeau (en option, supplément affiché avant la validation). Vous choisissez aussi d’afficher ou non votre nom au destinataire.' },
      ],
    },
    vendre: {
      type: 'steps',
      items: [
        { title: 'Créez votre espace vendeur', text: 'Rendez-vous sur [ezial.net/pro](/pro) et présentez votre boutique : logo, bannière, description et adresse.' },
        { title: 'Choisissez votre formule', text: `**Free** : ${FREE_PRODUCT_LIMIT} produits publiés, commission de ${FREE_COMMISSION_PERCENT} %. **${PLUS_PLAN_NAME}** : ${PREMIUM_PRODUCT_LIMIT} produits publiés, commission de ${PREMIUM_COMMISSION_PERCENT} %, essai gratuit de ${TRIAL_DAYS} jours.` },
        { title: 'Publiez vos produits', text: 'Ajoutez photos, descriptions et prix, puis renseignez les tailles, couleurs, variantes et le stock de chaque article.' },
        { title: 'Préparez vos commandes', text: 'Vous êtes notifié à chaque nouvelle commande. Indiquez qu’elle est prête : un livreur Ezial vient la récupérer, ou le client la retire en boutique avec son code de retrait.' },
        { title: 'Suivez vos ventes', text: 'L’espace Finances affiche vos ventes, la commission Ezial et votre montant net. Vous y demandez le paiement de votre solde disponible.' },
      ],
    },
    vendreLiens: {
      type: 'links',
      items: [
        { label: 'Créer mon espace vendeur', href: '/pro', primary: true },
        { label: 'Voir les tarifs vendeurs', href: '/info/tarifs-vendeurs/' },
      ],
    },
    aide: {
      type: 'cards',
      columns: 3,
      items: [
        { icon: 'help', title: 'Aide & FAQ', text: 'Les réponses aux questions les plus fréquentes.', href: '/info/centre-aide/', linkLabel: 'Consulter la FAQ' },
        { icon: 'truck', title: 'Livraison & retrait', text: 'Délais, frais et retrait en boutique.', href: '/info/livraison/', linkLabel: 'En savoir plus' },
        { icon: 'mail', title: 'Nous contacter', text: 'Notre équipe répond à vos questions.', href: '/info/contact/', linkLabel: 'Nous écrire' },
      ],
    },
  },
  markdown: `{{livraison}}

## Pour acheter

{{acheter}}

{{cadeau}}

## Pour vendre

{{vendre}}

{{vendreLiens}}

## Besoin d’aide ?

{{aide}}`,
};

const livraison = {
  slug: 'livraison',
  layout: 'simple',
  title: 'Livraison & retrait',
  metaTitle: 'Livraison et retrait — Ezial',
  description: 'Livraison Ezial en 4 à 48 h à Dakar et environs, frais calculés selon la distance et affichés avant validation, ou retrait en boutique.',
  intro: 'Faites-vous livrer à Dakar et dans ses environs, ou retirez votre commande directement en boutique lorsque celle-ci le propose.',
  blocks: {
    livraison: {
      ...deliveryHighlight,
      text: `À ${DELIVERY.area}. Les articles de plusieurs boutiques arrivent en une seule livraison.`,
    },
    modes: {
      type: 'cards',
      columns: 2,
      items: [
        { icon: 'truck', title: 'Livraison Ezial', text: 'À votre adresse, avec des frais calculés selon la distance et affichés avant la validation.' },
        { icon: 'store', title: 'Retrait en boutique', text: 'Lorsque la boutique le propose : présentez votre code de retrait sur place.' },
      ],
    },
  },
  markdown: `{{livraison}}

{{modes}}

## Livraison Ezial

Ezial livre à Dakar et dans ses environs. Lorsque votre commande réunit plusieurs boutiques, Ezial regroupe vos articles en une seule livraison vers votre adresse.

- **Délai** : ${DELIVERY.delay}. ${DELIVERY.legalNote}
- **Adresse** : utilisez votre position actuelle ou recherchez une adresse, puis ajustez le repère sur la carte. Vous pouvez ajouter un point de repère et des instructions pour le livreur.
- **Frais** : ils sont calculés selon la distance entre la ou les boutiques et votre adresse, et affichés avant la validation de la commande.
- **Préférence** : vous pouvez indiquer une date et un créneau souhaités. Ezial fait son possible pour les respecter, sans garantie.

## Retrait en boutique

Lorsque la boutique le propose, choisissez « Retrait en boutique » au moment de la commande : l’adresse de la boutique est indiquée. Dans une même commande, vous pouvez choisir la livraison pour certaines boutiques et le retrait pour d’autres.

Quand votre commande est prête, un **code de retrait** s’affiche dans le suivi de votre commande : présentez-le à la boutique.

## Commande cadeau

Si votre commande est un cadeau, elle est remise au destinataire dont vous indiquez le nom et le téléphone. Vous pouvez ajouter un petit mot et un emballage cadeau en option.

## Suivre votre commande

Depuis votre compte, rubrique « Mes commandes », chaque étape s’affiche : en préparation, prête, en livraison, livrée. Vous pouvez aussi activer les notifications de suivi de commande depuis votre compte.

## Un problème avec votre livraison ?

Depuis votre commande, choisissez « Signaler un problème », ou écrivez-nous à ${EMAIL_LINK}. Ezial vérifie la livraison et recherche une solution adaptée. Consultez aussi notre [politique de retours et de remboursements](/info/retours/).`,
};

const paiement = {
  slug: 'paiement',
  layout: 'simple',
  title: 'Paiement',
  metaTitle: 'Paiement — Ezial',
  description: 'Payer sur Ezial : Wave et Orange Money, paiement en ligne en cours d’activation. Ezial ne vous demandera jamais votre code PIN ou un code secret.',
  intro: 'Sur Ezial, vous réglez vos achats par paiement mobile, avec Wave ou Orange Money.',
  blocks: {
    activation: {
      type: 'highlight',
      tone: 'notice',
      title: PAYMENT_ACTIVATION,
      text: 'Les moyens de paiement disponibles sont indiqués au moment de la commande.',
    },
    moyens: {
      type: 'cards',
      columns: 2,
      items: [
        { icon: 'smartphone', title: 'Wave', text: 'Paiement mobile.' },
        { icon: 'smartphone', title: 'Orange Money', text: 'Paiement mobile.' },
      ],
    },
    securite: {
      type: 'cards',
      columns: 1,
      items: [
        { icon: 'shield', title: 'Ezial ne vous demandera jamais votre code PIN', text: 'Ni votre mot de passe bancaire, ni un code secret de paiement. Si quelqu’un vous les demande au nom d’Ezial, ne les communiquez pas et signalez-le-nous.' },
      ],
    },
  },
  markdown: `{{activation}}

## Moyens de paiement

{{moyens}}

## Avant de payer

Un récapitulatif complet s’affiche avant la confirmation : articles, frais de livraison, emballage cadeau le cas échéant, code promo appliqué et montant total. Les prix sont affichés en francs CFA (FCFA).

## Votre sécurité

{{securite}}

Toute anomalie de paiement peut être signalée à ${EMAIL_LINK} pour vérification.

## Remboursements

En cas de retour accepté ou de problème avec une commande, le remboursement est traité selon notre [politique de retours et de remboursements](/info/retours/). L’état de votre demande est consultable depuis votre compte.`,
};

const contact = {
  slug: 'contact',
  layout: 'simple',
  title: 'Nous contacter',
  breadcrumb: 'Contact',
  metaTitle: 'Contact — Ezial',
  description: `Contacter Ezial : ${CONTACT.email}, ${CONTACT.phone}, Dakar. Une question sur une commande, une livraison ou la vente sur Ezial ? Écrivez-nous.`,
  intro: 'Une question sur une commande, une livraison ou la vente sur Ezial ? Notre équipe est là pour vous aider.',
  jsonLdType: 'ContactPage',
  blocks: {
    coordonnees: contactCards(true),
    aide: {
      type: 'links',
      items: [
        { label: 'Consulter l’aide & FAQ', href: '/info/centre-aide/', primary: true },
        { label: 'Retours & remboursements', href: '/info/retours/' },
      ],
    },
  },
  markdown: `{{coordonnees}}

Nous répondons généralement sous 24 h.

## Une question sur une commande ?

Le plus rapide : ouvrez votre commande depuis votre compte et choisissez « Signaler un problème » ou « Demander un retour ou un échange ». Votre demande est directement rattachée à la commande concernée et vous suivez son avancement.

Si vous nous écrivez, indiquez le numéro de votre commande et décrivez la situation. Des photos peuvent vous être demandées lorsqu’elles sont utiles.

{{aide}}

## Vous êtes vendeur ?

Pour ouvrir votre boutique, rendez-vous sur [ezial.net/pro](/pro) et consultez nos [tarifs vendeurs](/info/tarifs-vendeurs/). Pour toute question, écrivez-nous à ${EMAIL_LINK}.

## Données personnelles

Pour toute question ou demande relative à vos données personnelles, écrivez à ${EMAIL_LINK}. Les détails figurent dans notre [politique de confidentialité](/info/confidentialite/).`,
};

const centreAide = {
  slug: 'centre-aide',
  aliases: ['faq'],
  layout: 'legal',
  toc: true,
  title: 'Aide & FAQ',
  metaTitle: 'Aide et FAQ — Ezial',
  description: 'Questions fréquentes sur Ezial : commandes, livraison en 4 à 48 h, paiement Wave et Orange Money, retours, compte et vente sur la marketplace.',
  intro: 'Trouvez rapidement une réponse à vos questions, classées par rubrique. Vous ne trouvez pas ? Contactez-nous.',
  blocks: {
    livraison: deliveryHighlight,
    contact: {
      type: 'links',
      items: [
        { label: 'Nous contacter', href: '/info/contact/', primary: true },
        { label: 'Comment ça marche', href: '/info/comment-ca-marche/' },
      ],
    },
  },
  markdown: `{{livraison}}

## Commandes

### Puis-je commander dans plusieurs boutiques ?

Oui. Ezial permet de réunir des produits de différentes boutiques dans une même commande et coordonne leur livraison selon les modalités annoncées.

### Comment suivre ma commande ?

Depuis votre compte, rubrique « Mes commandes » : chaque étape s’affiche (en préparation, prête, en livraison, livrée). Vous pouvez aussi activer les notifications de suivi de commande depuis votre compte.

### Puis-je offrir une commande ?

Oui. Au moment de la commande, cochez « Cette commande est un cadeau » et indiquez le nom et le téléphone du destinataire. Vous pouvez ajouter un petit mot et un emballage cadeau en option.

### Comment utiliser un code promo ?

Saisissez-le à l’étape du paiement, dans le champ « Code promo » : la réduction s’affiche dans le récapitulatif avant la confirmation.

### Que faire si je n’ai pas reçu ma commande ?

Signalez le problème depuis votre commande, dans votre espace client, ou contactez le service client. Ezial vérifiera la livraison et recherchera une solution adaptée.

## Livraison & retrait

### Quand recevrai-je ma commande ?

Ezial livre en **${DELIVERY.delay}** à ${DELIVERY.area}. ${DELIVERY.legalNote}

### Combien coûte la livraison ?

Les frais sont calculés selon la distance entre la ou les boutiques et votre adresse, et affichés avant la validation de la commande. Les articles de plusieurs boutiques sont regroupés en une seule livraison.

### Puis-je retirer ma commande en boutique ?

Oui, lorsque la boutique le propose. Choisissez « Retrait en boutique » au moment de la commande ; quand elle est prête, un code de retrait s’affiche dans le suivi de votre commande : présentez-le à la boutique.

### Puis-je choisir le jour ou le créneau de livraison ?

Vous pouvez indiquer une date et un créneau souhaités au moment de la commande. Ezial fait son possible pour les respecter, sans garantie.

En savoir plus : [Livraison & retrait](/info/livraison/).

## Paiement

### Quels moyens de paiement sont acceptés ?

Wave et Orange Money. ${PAYMENT_ACTIVATION}

### Ezial peut-il me demander mon code PIN ?

Non. Ezial ne vous demandera jamais votre code PIN, votre mot de passe bancaire ou un code secret de paiement. Toute anomalie peut être signalée au service client pour vérification.

### Les frais de livraison sont-ils inclus dans le prix des articles ?

Non. Les prix des articles sont affichés en FCFA ; les frais de livraison et, le cas échéant, l’emballage cadeau sont indiqués séparément, avant la validation de la commande.

En savoir plus : [Paiement](/info/paiement/).

## Retours & réclamations

### Puis-je échanger un article dont la taille ne me convient pas ?

Oui, un échange peut être demandé selon les tailles disponibles et les conditions applicables. Le droit légal de rétractation reste préservé.

### Que faire si mon article est abîmé ou incorrect ?

Depuis votre commande, sélectionnez « Signaler un problème » et décrivez la situation. Vous pouvez également écrire à ${EMAIL_LINK}.

### Combien de temps ai-je pour demander un retour ?

Le droit légal de rétractation est en principe de sept jours ouvrables après réception, sauf exceptions prévues par la réglementation.

### Comment suivre mon remboursement ?

L’état de votre demande est consultable depuis votre compte. Vous recevez une information lorsqu’une décision est prise et lorsque le remboursement est effectué.

### Comment signaler une boutique ?

Utilisez « Signaler cette boutique » sur la page de la boutique, ou contactez le service client.

En savoir plus : [Retours, échanges et remboursements](/info/retours/).

## Compte & sécurité

### Que trouve-t-on dans mon compte ?

Vos commandes, vos favoris, vos adresses et vos informations personnelles. Vous y activez aussi les notifications de suivi de commande.

### J’ai oublié mon mot de passe

Sur la page de connexion, choisissez « Mot de passe oublié ? » : un lien de réinitialisation vous est envoyé par email.

### Comment supprimer mon compte ?

Dans « Mes informations », choisissez « Supprimer mon compte ». Vos informations personnelles (nom, téléphone, adresse) sont alors anonymisées ; vos commandes passées sont conservées pour la comptabilité, sans y être associées nominativement. Cette action est irréversible.

### Comment protéger mon compte ?

Fournissez des informations exactes et gardez vos accès confidentiels. Ezial ne vous demandera jamais votre code PIN ni un code secret de paiement.

## Vendre sur Ezial

### Combien coûte la vente sur Ezial ?

**Free** est gratuite : jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés et une commission de ${FREE_COMMISSION_PERCENT} % sur chaque vente. **${PLUS_PLAN_NAME}** coûte ${QUARTERLY} tous les 3 mois ou ${ANNUAL} par an : jusqu’à ${PREMIUM_PRODUCT_LIMIT} produits publiés et une commission de ${PREMIUM_COMMISSION_PERCENT} %.

### La commission change-t-elle pendant une promotion ?

Non. Le taux reste le même : ${FREE_COMMISSION_PERCENT} % avec Free, ${PREMIUM_COMMISSION_PERCENT} % avec ${PLUS_PLAN_NAME}. Il s’applique au prix de vente après la réduction que vous avez appliquée, et jamais aux frais de livraison.

### Comment fonctionne l’essai gratuit d’${PLUS_PLAN_NAME} ?

${TRIAL_RULES} L’essai ne se transforme jamais automatiquement en abonnement payant.

${TRIAL_PRELAUNCH_NOTE}

### Que se passe-t-il à la fin de l’essai ou de l’abonnement ?

${PLAN_END_RULES}

### Comment suis-je payé pour mes ventes ?

Depuis l’espace Finances de votre espace vendeur : vous y voyez vos ventes, la commission Ezial déduite automatiquement et votre montant net, et vous demandez le paiement de votre solde disponible.

### Comment ouvrir ma boutique ?

Rendez-vous sur [ezial.net/pro](/pro) pour créer votre espace vendeur. Tous les détails sont dans nos [tarifs vendeurs](/info/tarifs-vendeurs/).

## Vous n’avez pas trouvé votre réponse ?

Notre équipe est là pour vous aider : ${EMAIL_LINK} ou ${PHONE_LINK}.

{{contact}}`,
};

const conditionsGenerales = {
  slug: 'conditions-generales',
  layout: 'legal',
  toc: true,
  title: 'Conditions générales de vente et d’utilisation',
  breadcrumb: 'Conditions générales',
  metaTitle: 'Conditions générales de vente et d’utilisation — Ezial',
  description: 'Conditions générales de vente et d’utilisation d’Ezial : commandes, prix, paiement, livraison, retours, comptes, formules et commissions des vendeurs.',
  updated: LEGAL_UPDATED,
  updatedIso: LEGAL_UPDATED_ISO,
  markdown: `## Présentation d’Ezial

Ezial est une marketplace sénégalaise permettant aux consommateurs de découvrir et d’acheter des produits proposés par différentes boutiques partenaires ainsi que par la boutique exploitée directement par Ezial.

Chaque fiche produit identifie la boutique qui propose l’article. Ezial assure le fonctionnement de la plateforme, la coordination des commandes et les services associés selon les modalités présentées au client.

## Produits et prix

Les vendeurs doivent fournir des descriptions exactes et des photographies fidèles des produits proposés. Les caractéristiques essentielles, les variantes disponibles et le prix sont présentés avant l’achat.

Les prix sont affichés en francs CFA. Les frais de livraison et les éventuels autres frais sont communiqués avant la validation de la commande.

## Commandes

Le client peut consulter son panier, modifier les quantités, corriger ses informations et vérifier le montant total avant de confirmer son achat.

Une confirmation de commande est mise à sa disposition. En cas d’indisponibilité d’un produit, Ezial informe le client et organise une solution appropriée, notamment un remplacement accepté ou un remboursement.

## Paiements

Les moyens de paiement proposés sont Wave et Orange Money ; ceux effectivement disponibles sont indiqués lors de la commande. ${PAYMENT_ACTIVATION}

Ezial ne demande jamais aux clients de transmettre leur code PIN, leur mot de passe bancaire ou un code secret de paiement. Toute anomalie de paiement peut être signalée au service client pour vérification.

## Livraison

Les zones desservies, les frais applicables et les estimations de livraison sont indiqués avant la validation de la commande.

${DELIVERY_LEGAL}

Lorsqu’une commande comprend plusieurs boutiques, Ezial coordonne la collecte des articles et organise leur livraison selon les modalités annoncées au client. Lorsque la boutique le propose, le client peut choisir le retrait en boutique. Les modalités pratiques sont détaillées sur la page [Livraison & retrait](/info/livraison/).

## Retours et remboursements

Les conditions applicables sont détaillées dans la [politique de retours, d’échanges et de remboursements](/info/retours/) d’Ezial, accessible avant l’achat.

Les droits légaux du consommateur prévalent sur toute condition commerciale contraire.

## Comptes et utilisation

Les utilisateurs doivent fournir des informations exactes et préserver la confidentialité de leurs accès.

Les fraudes, les faux avis, l’utilisation abusive des données personnelles et les comportements contraires à la loi sont interdits.

Ezial peut prendre des mesures proportionnées contre les comptes ou boutiques ne respectant pas ces règles, sans supprimer les droits relatifs aux commandes déjà effectuées.

## Vendeurs : formules et commissions

Cette section s’applique aux boutiques qui vendent sur Ezial.

### Formules

- **Free** : gratuite, jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés, commission de ${FREE_COMMISSION_PERCENT} % sur chaque vente.
- **${PLUS_PLAN_NAME}** : ${QUARTERLY} pour 3 mois ou ${ANNUAL} pour un an, jusqu’à ${PREMIUM_PRODUCT_LIMIT} produits publiés, commission de ${PREMIUM_COMMISSION_PERCENT} % sur chaque vente. ${PLUS_SAME_BENEFITS_NOTE}

Le détail des formules figure sur la page [Tarifs vendeurs](/info/tarifs-vendeurs/).

### Commission

La commission Ezial s’applique à chaque vente. Son taux dépend uniquement de la formule de la boutique : ${FREE_COMMISSION_PERCENT} % avec Free, ${PREMIUM_COMMISSION_PERCENT} % avec ${PLUS_PLAN_NAME}, pendant l’essai comme avec l’abonnement payant.

Le taux reste identique lorsque le vendeur applique une promotion. La commission est calculée sur le prix de vente des produits, après la réduction appliquée par le vendeur, et jamais sur les frais de livraison. Elle est déduite automatiquement du montant des ventes, visible dans l’espace Finances du vendeur.

### Essai gratuit d’${PLUS_PLAN_NAME}

${TRIAL_RULES} L’essai ne se transforme jamais automatiquement en abonnement payant.

${TRIAL_PRELAUNCH_NOTE}

### Paiement et renouvellement

${PLUS_PLAN_NAME} se règle par Wave ou Orange Money depuis l’espace « Mon abonnement ». L’abonnement est activé pour la durée payée, uniquement après confirmation du paiement par l’opérateur. Le renouvellement se fait à l’initiative du vendeur : aucun prélèvement automatique n’est effectué. Le paiement en ligne est en cours d’activation.

### Fin d’abonnement

${PLAN_END_RULES}

### Responsabilités des vendeurs

Chaque vendeur partenaire est responsable des informations qu’il communique concernant ses produits, notamment :

- les descriptions et caractéristiques ;
- les photographies et illustrations ;
- les prix et promotions ;
- les disponibilités et les stocks ;
- la conformité, l’authenticité et la qualité des produits.

Les vendeurs garantissent disposer des droits ou autorisations nécessaires à l’utilisation des contenus qu’ils publient sur Ezial. Ezial se réserve le droit de vérifier, modifier, suspendre ou supprimer toute annonce qui ne respecte pas les règles de la plateforme ou la réglementation applicable.

## Réclamations et litiges

Toute réclamation peut être adressée à ${EMAIL_LINK}.

Ezial recherche prioritairement une solution amiable. Le consommateur conserve le droit de saisir les autorités ou juridictions compétentes.

Les présentes conditions sont soumises au droit sénégalais, sous réserve des dispositions impératives applicables.`,
};

const retours = {
  slug: 'retours',
  layout: 'legal',
  toc: true,
  title: 'Retours, échanges et remboursements',
  breadcrumb: 'Retours & remboursements',
  metaTitle: 'Retours, échanges et remboursements — Ezial',
  description: 'Politique de retours d’Ezial : droit de rétractation de sept jours ouvrables, échanges de taille, produits défectueux, remboursements et demandes en ligne.',
  updated: LEGAL_UPDATED,
  updatedIso: LEGAL_UPDATED_ISO,
  markdown: `## Notre engagement

Ezial souhaite garantir aux consommateurs une expérience d’achat transparente et un traitement équitable des difficultés rencontrées après une commande.

## Droit de rétractation

Conformément au décret sénégalais n° 2008-718 relatif au commerce électronique, le consommateur dispose en principe de **sept jours ouvrables** à compter de la réception d’un produit pour exercer son droit de rétractation, sans avoir à justifier sa décision et sans pénalité.

Certaines exceptions prévues par la réglementation peuvent s’appliquer, notamment à des produits personnalisés ou à certains biens qui, par leur nature, ne peuvent pas être réexpédiés.

Le client peut notifier sa décision depuis son espace de commande ou par courrier électronique à ${EMAIL_LINK}. Une confirmation écrite de la demande lui est adressée.

## Remboursement après rétractation

Lorsqu’une rétractation est valablement exercée, Ezial organise le traitement du remboursement dans les conditions prévues par la réglementation sénégalaise.

Le décret n° 2008-718 prévoit notamment un remboursement au plus tard dans les quinze jours suivant la réception de la notification de rétractation, sans frais et selon les conditions de paiement applicables.

Les frais directs de retour peuvent être à la charge du consommateur dans les conditions prévues par la loi. Ils ne sont pas à sa charge lorsque le fournisseur n’a pas livré le bon produit.

## Échanges pour problème de taille

Lorsqu’un client souhaite une autre taille, il peut demander un échange.

Ezial vérifie la disponibilité de la nouvelle taille et organise l’échange avec la boutique concernée. Les conditions pratiques et les éventuels frais sont communiqués avant confirmation.

Si le vendeur a envoyé une taille différente de celle commandée, les frais nécessaires à la correction de cette erreur ne sont pas supportés par le client.

L’échange constitue une solution proposée au consommateur et ne remplace pas son droit légal de rétractation lorsqu’il est applicable.

## Produits défectueux ou non conformes

Lorsqu’un article est défectueux, endommagé, incomplet ou différent de sa description, le client peut déposer une réclamation.

Ezial examine le problème avec le vendeur et organise une solution adaptée aux droits du consommateur : correction, échange, remplacement ou remboursement.

## Signalement dans les 48 heures

Pour faciliter une prise en charge rapide, Ezial recommande de signaler les problèmes visibles dans les 48 heures suivant la réception.

Ce délai constitue une recommandation de service. Il ne supprime pas les droits légaux du consommateur et ne permet pas de refuser automatiquement une réclamation ultérieure.

## Produits de beauté et articles particuliers

Les éventuelles restrictions de retour doivent correspondre à une exception légalement applicable et être clairement indiquées sur la fiche produit avant l’achat.

## Commandes de plusieurs boutiques

Lorsqu’un problème concerne un seul article d’une commande regroupant plusieurs boutiques, Ezial peut traiter une réclamation ou un remboursement partiel sans annuler les autres articles.

## Comment faire une demande ?

1. Ouvrez la commande concernée depuis votre compte.
2. Choisissez « Signaler un problème » ou « Demander un retour ou un échange » ; vous pouvez aussi écrire à ${EMAIL_LINK}.
3. Indiquez les articles concernés et décrivez le problème. Des photographies peuvent être demandées lorsqu’elles sont utiles au traitement du dossier.

Le client est informé de l’avancement de sa demande jusqu’à sa résolution.`,
};

const confidentialite = {
  slug: 'confidentialite',
  layout: 'legal',
  toc: true,
  title: 'Politique de confidentialité',
  breadcrumb: 'Confidentialité',
  metaTitle: 'Politique de confidentialité — Ezial',
  description: 'Comment Ezial traite vos données personnelles : informations collectées, finalités, partage, prestataires techniques, cookies, conservation et droits.',
  updated: LEGAL_UPDATED,
  updatedIso: LEGAL_UPDATED_ISO,
  markdown: `## Protection des données

Ezial traite les données personnelles nécessaires au fonctionnement de sa marketplace conformément à la législation sénégalaise applicable, notamment la loi n° 2008-12 relative à la protection des données à caractère personnel. Les coordonnées d’Ezial figurent dans les [mentions légales](/info/mentions-legales/).

## Informations collectées

Selon les services utilisés, Ezial peut traiter :

- les informations d’identification et de contact (nom, prénom, téléphone, adresse électronique) ;
- les adresses de livraison et la position de livraison choisie sur la carte ou fournie par la géolocalisation de votre appareil, si vous l’autorisez ;
- les informations de commande, y compris le nom et le téléphone du destinataire d’une commande cadeau ;
- les réclamations et les photos que vous y joignez ;
- les préférences exprimées (favoris, notifications) ;
- certaines données techniques nécessaires à la sécurité et au fonctionnement du site.

## Finalités du traitement

Ces données servent à gérer les comptes, exécuter les commandes, organiser les livraisons, traiter les paiements et remboursements, répondre aux réclamations et prévenir les utilisations frauduleuses.

Les notifications de suivi de commande ne sont envoyées que si vous les activez. Les communications commerciales sont soumises aux règles applicables et aux choix exprimés par les utilisateurs : les notifications promotionnelles ne sont envoyées qu’aux personnes qui les ont acceptées.

## Partage des données

Les informations nécessaires à une commande peuvent être transmises aux boutiques concernées, aux livreurs et aux prestataires techniques ou de paiement intervenant dans sa réalisation.

Les vendeurs et livreurs ne sont pas autorisés à réutiliser les coordonnées des clients pour des sollicitations personnelles ou commerciales non autorisées.

Ezial ne commercialise pas les données personnelles de ses utilisateurs.

## Prestataires techniques

Ezial s’appuie sur les prestataires techniques suivants :

- **Supabase** : comptes utilisateurs, base de données et stockage des fichiers (photos des produits, des boutiques et des réclamations). La base de données, les comptes et les fichiers sont hébergés dans la région de Paris (France) de ce prestataire.
- **Cloudflare** : hébergement et diffusion du site.
- **Google Maps Platform** : affichage de la carte, recherche d’adresse et calcul de la distance de livraison.
- **OpenStreetMap (service Nominatim)** : affichage d’une adresse lisible à partir du point choisi sur la carte.
- **Google Fonts** : affichage des polices de caractères du site.
- **Notifications push** : si vous les activez, elles sont acheminées par le service de notifications de votre navigateur ou de votre appareil.

Certains de ces prestataires traitent des données en dehors du Sénégal. Pour ces transferts, Ezial s’attache à vérifier les garanties applicables et à accomplir les formalités prévues par la législation sénégalaise.

## Conservation et sécurité

Les données sont conservées pendant les durées nécessaires à leurs finalités et aux obligations légales applicables.

Ezial met en place des mesures techniques et organisationnelles destinées à limiter les accès non autorisés, les pertes de données et les divulgations injustifiées.

Lorsque vous supprimez votre compte, vos informations personnelles (nom, téléphone, adresse) sont anonymisées ; vos commandes passées sont conservées pour la comptabilité, sans y être associées nominativement.

## Droits des personnes

Les utilisateurs peuvent exercer les droits que leur reconnaît la législation applicable, notamment les droits d’accès, de rectification et, lorsque les conditions légales sont réunies, de suppression ou d’opposition.

Vous pouvez modifier vos informations depuis « Mes informations » et supprimer votre compte depuis votre espace client. Les autres demandes peuvent être adressées à ${EMAIL_LINK}.

## Cookies

Le site utilise des technologies de stockage du navigateur (stockage local et technologies similaires) nécessaires à son fonctionnement : maintien de votre connexion, contenu de votre panier et de vos favoris, informations saisies lors d’une commande en cours.

Ezial n’utilise pas de cookies publicitaires. Si des outils de mesure d’audience ou de marketing sont activés, les utilisateurs reçoivent les informations nécessaires et leur consentement est recueilli lorsqu’il est requis. Les services tiers intégrés au site, comme la carte Google Maps, appliquent leurs propres règles.

Vous pouvez à tout moment effacer les données de navigation enregistrées par votre navigateur depuis ses réglages ; vous serez alors déconnecté et votre panier sera vidé.

## Contact

Toute question relative aux données personnelles peut être adressée à ${EMAIL_LINK}.`,
};

const mentionsLegales = {
  slug: 'mentions-legales',
  layout: 'legal',
  toc: true,
  title: 'Mentions légales',
  metaTitle: 'Mentions légales — Ezial',
  description: `Mentions légales d’ezial.net : entreprise Ezial, entreprise individuelle, RCCM ${COMPANY.rccm}, NINEA ${COMPANY.ninea}, Dakar. Hébergement et contact.`,
  updated: LEGAL_UPDATED,
  updatedIso: LEGAL_UPDATED_ISO,
  jsonLdType: 'Organization',
  blocks: {
    identite: {
      type: 'facts',
      items: [
        { label: 'Dénomination', value: COMPANY.denomination },
        { label: 'Nom commercial', value: COMPANY.tradeName },
        { label: 'Forme juridique', value: COMPANY.legalForm },
        { label: 'RCCM', value: COMPANY.rccm },
        { label: 'NINEA', value: COMPANY.ninea },
        { label: 'Adresse', value: COMPANY.address },
        { label: 'Email', value: CONTACT.email, href: `mailto:${CONTACT.email}` },
        { label: 'Téléphone', value: CONTACT.phone, href: CONTACT.phoneHref },
        { label: 'Site internet', value: SITE_URL, href: '/' },
      ],
    },
  },
  markdown: `## 1. Éditeur du site

Le site ezial.net est exploité par l’entreprise ${COMPANY.name}.

{{identite}}

Ezial est une plateforme de vente en ligne permettant à des boutiques et vendeurs partenaires de proposer leurs produits aux consommateurs, principalement au Sénégal.

## 2. Responsable de la publication

La responsable de la publication du site est ${COMPANY.publicationManager}.

Toute demande concernant le site peut être adressée à : ${EMAIL_LINK}.

## 3. Hébergement et infrastructure technique

Le site est hébergé et diffusé par **Cloudflare, Inc.**, au moyen du service Cloudflare Pages ([www.cloudflare.com](https://www.cloudflare.com)).

Les données et les fonctionnalités applicatives de la plateforme (comptes, base de données, fichiers) reposent sur **Supabase** ([supabase.com](https://supabase.com)). Elles sont hébergées dans la région de Paris (France) de ce prestataire.

La liste des prestataires techniques figure dans la [politique de confidentialité](/info/confidentialite/?section=prestataires-techniques).

## 4. Objet de la plateforme

Ezial est une marketplace multivendeur facilitant la mise en relation entre les consommateurs et des boutiques partenaires indépendantes.

La plateforme permet notamment :

- la consultation de produits et de catalogues de boutiques ;
- la recherche et la sélection de produits ;
- la constitution de paniers regroupant plusieurs boutiques ;
- la passation et le suivi de commandes ;
- le paiement par les moyens proposés sur le site ;
- l’organisation de la livraison à domicile ou du retrait en boutique ;
- la communication d’informations relatives aux commandes.

Ezial fournit une infrastructure numérique et des services facilitant les transactions commerciales entre les utilisateurs et les vendeurs partenaires.

Les modalités précises de chaque transaction sont définies dans les [conditions générales de vente et d’utilisation](/info/conditions-generales/), notamment, pour les vendeurs partenaires, dans leur section [Vendeurs : formules et commissions](/info/conditions-generales/?section=vendeurs-formules-et-commissions).

## 5. Informations relatives aux vendeurs partenaires

Les produits proposés sur Ezial peuvent être commercialisés par des vendeurs professionnels indépendants.

Chaque vendeur partenaire est responsable des informations qu’il communique concernant ses produits, notamment :

- les descriptions et caractéristiques ;
- les photographies et illustrations ;
- les prix et promotions ;
- les disponibilités et les stocks ;
- la conformité, l’authenticité et la qualité des produits.

Ezial se réserve le droit de vérifier, modifier, suspendre ou supprimer toute annonce qui ne respecte pas les règles de la plateforme ou la réglementation applicable.

Cette disposition ne limite pas les responsabilités légales pouvant incomber à Ezial dans le cadre de ses propres prestations.

## 6. Prix et modalités de paiement

Les prix affichés sur la plateforme sont exprimés en francs CFA (FCFA).

Les frais de livraison et les éventuels frais supplémentaires applicables sont communiqués au client avant la validation définitive de sa commande.

Les moyens de paiement proposés sont Wave et Orange Money. ${PAYMENT_ACTIVATION}

Les transactions sont soumises aux conditions et aux mesures de sécurité des prestataires de paiement concernés.

Ezial s’engage à présenter les informations tarifaires de manière claire et transparente, conformément à la réglementation applicable.

## 7. Livraison et retrait des commandes

Ezial propose, selon les produits et les boutiques concernés, des services de livraison à domicile et de retrait en boutique.

Les zones desservies, les délais estimés, les frais applicables et les conditions de retrait sont communiqués au moment de la commande.

${DELIVERY_LEGAL}

Les modalités détaillées de livraison, de retrait, de réclamation et de remboursement sont présentées sur les pages [Livraison & retrait](/info/livraison/) et [Retours, échanges et remboursements](/info/retours/).

## 8. Propriété intellectuelle

Le nom Ezial, son logo, son identité visuelle, son interface, ses éléments graphiques et les contenus originaux réalisés pour la plateforme sont protégés par les dispositions applicables en matière de propriété intellectuelle.

Toute reproduction, modification, distribution ou exploitation non autorisée d’éléments protégés est interdite, sous réserve des exceptions prévues par la loi.

Les photographies, marques, descriptions et autres contenus fournis par les vendeurs partenaires demeurent la propriété de leurs titulaires respectifs.

Les vendeurs garantissent disposer des droits ou autorisations nécessaires à l’utilisation des contenus qu’ils publient sur Ezial.

## 9. Protection des données personnelles

Dans le cadre de ses activités, Ezial peut être amené à collecter et traiter des données personnelles concernant les clients, vendeurs et livreurs utilisant la plateforme.

Ces informations peuvent notamment comprendre :

- le nom et le prénom ;
- les coordonnées téléphoniques et électroniques ;
- les adresses de livraison ;
- les informations relatives aux commandes ;
- les données nécessaires à la gestion des comptes et des prestations.

Ces traitements sont réalisés conformément à la législation sénégalaise applicable, notamment la loi n° 2008-12 du 25 janvier 2008 relative à la protection des données à caractère personnel.

Les données sont utilisées pour les finalités déterminées et légitimes liées au fonctionnement de la plateforme, à la gestion des commandes, aux paiements, à la livraison, à l’assistance aux utilisateurs et au respect des obligations légales.

Certaines informations peuvent être transmises aux vendeurs, livreurs ou prestataires techniques lorsque cela est nécessaire à l’exécution des services concernés.

Les utilisateurs disposent des droits prévus par la législation applicable. Pour toute question ou demande concernant leurs données personnelles, ils peuvent contacter : ${EMAIL_LINK}.

Les informations détaillées relatives aux traitements de données figurent dans la [politique de confidentialité](/info/confidentialite/) d’Ezial.

## 10. Cookies et technologies similaires

Ezial peut utiliser des cookies ou des technologies similaires afin d’assurer le fonctionnement de la plateforme, de maintenir les sessions des utilisateurs et d’améliorer les services proposés.

Lorsque leur utilisation nécessite un consentement préalable, les technologies non essentielles ne sont activées qu’après obtention de celui-ci.

Les technologies utilisées et la gestion de vos préférences sont présentées dans la [section Cookies de la politique de confidentialité](/info/confidentialite/?section=cookies).

## 11. Responsabilité

Ezial s’efforce de garantir l’accessibilité, la sécurité et le bon fonctionnement de sa plateforme.

Des interruptions temporaires peuvent toutefois intervenir en raison d’opérations de maintenance, de mises à jour, d’incidents techniques ou d’événements indépendants de sa volonté.

Les vendeurs partenaires demeurent responsables de leurs propres obligations commerciales et légales.

Ezial reste responsable des obligations qui lui incombent en vertu de la réglementation applicable et des engagements contractuels qu’elle assume dans le cadre de ses services.

Aucune disposition des présentes mentions légales ne peut être interprétée comme excluant une responsabilité qui ne pourrait légalement être écartée.

## 12. Liens vers des services tiers

Le site peut contenir des liens vers des sites internet, services de paiement ou plateformes exploités par des tiers.

Ces services sont soumis à leurs propres conditions d’utilisation et politiques de confidentialité.

Ezial n’exerce pas nécessairement de contrôle sur leur contenu ou leur fonctionnement et ne saurait être tenue responsable de leurs activités en dehors des obligations qui lui sont légalement applicables.

## 13. Signalements et réclamations

Tout utilisateur peut contacter Ezial pour signaler :

- une information inexacte ou trompeuse ;
- un produit suspect ou non conforme ;
- un contenu portant atteinte à des droits ;
- une utilisation frauduleuse de la plateforme ;
- un problème relatif à une commande ;
- une difficulté concernant la livraison ou le service client.

Les demandes et réclamations peuvent être adressées à : ${EMAIL_LINK}.

Ezial examine les signalements reçus et prend les mesures appropriées conformément à ses obligations légales et contractuelles.

## 14. Droit applicable

Les présentes mentions légales sont régies par la législation applicable au Sénégal, notamment les dispositions relatives aux transactions électroniques, à la protection des données personnelles et aux activités commerciales.

Tout différend relatif à l’utilisation du site est soumis aux règles de compétence prévues par la législation applicable, sans préjudice des dispositions impératives protégeant les consommateurs.

## 15. Modification des mentions légales

Ezial peut actualiser les présentes mentions légales afin de tenir compte de l’évolution de ses services, de sa structure administrative, de ses prestataires ou de la réglementation applicable.

La version en vigueur est celle publiée sur le site internet, accompagnée de sa date de dernière mise à jour.`,
};

const tarifsVendeurs = {
  slug: 'tarifs-vendeurs',
  layout: 'pricing',
  title: 'Vendez sur Ezial, à votre rythme',
  breadcrumb: 'Tarifs vendeurs',
  metaTitle: `Tarifs vendeurs : Free et ${PLUS_PLAN_NAME} — Ezial`,
  description: `Vendez sur Ezial : Free, gratuit, ${FREE_PRODUCT_LIMIT} produits et ${FREE_COMMISSION_PERCENT} % de commission, ou ${PLUS_PLAN_NAME} dès ${QUARTERLY} / 3 mois, ${PREMIUM_PRODUCT_LIMIT} produits et ${PREMIUM_COMMISSION_PERCENT} % de commission.`,
  intro: `Commencez gratuitement avec ${FREE_PRODUCT_LIMIT} produits. Passez à ${PLUS_PLAN_NAME} pour en publier ${PREMIUM_PRODUCT_LIMIT} et ne payer que ${PREMIUM_COMMISSION_PERCENT} % de commission.`,
  blocks: {
    formules: { type: 'pricingCards' },
    avantages: { type: 'plusHighlights' },
    comparatif: { type: 'planComparison' },
  },
  markdown: `{{formules}}

Commencez gratuitement, sans obligation de vous abonner.

## Les avantages d’${PLUS_PLAN_NAME}

{{avantages}}

## Free ou ${PLUS_PLAN_NAME} : le comparatif

{{comparatif}}

${PLUS_SAME_BENEFITS_NOTE}

## Essai gratuit

${TRIAL_RULES} L’essai ne se transforme jamais automatiquement en abonnement payant.

> ${TRIAL_PRELAUNCH_NOTE}

## Activation et renouvellement

${PLUS_PLAN_NAME} se règle par Wave ou Orange Money depuis l’espace « Mon abonnement », au choix tous les 3 mois (${QUARTERLY}) ou une fois par an (${ANNUAL} au lieu de ${ANNUAL_REFERENCE}). L’abonnement est activé pour la durée payée uniquement après confirmation du paiement par l’opérateur. Le renouvellement se fait à l’initiative du vendeur : Ezial ne débite jamais un vendeur automatiquement. Le paiement en ligne est en cours d’activation.

## Fin d’abonnement

${PLAN_END_RULES}

## Commission Ezial

La commission Ezial dépend uniquement de la formule : **${FREE_COMMISSION_PERCENT} % sur chaque vente en Free**, **${PREMIUM_COMMISSION_PERCENT} % sur chaque vente en ${PLUS_PLAN_NAME}** (essai ou payant, trimestriel ou annuel). C’est l’un des principaux avantages d’${PLUS_PLAN_NAME} : sur une vente de ${formatFcfa(EXAMPLE_SALE)}, la commission est de ${exampleCommission(PREMIUM_COMMISSION_PERCENT)} au lieu de ${exampleCommission(FREE_COMMISSION_PERCENT)}.

Le taux reste le même lorsque vous appliquez une promotion. La commission est calculée sur le prix de vente de vos produits, après la réduction que vous avez appliquée, et jamais sur les frais de livraison.

## Questions fréquentes

### Est-il obligatoire de payer pour vendre sur Ezial ?

Non. Free permet de vendre gratuitement avec jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés. Une commission de ${FREE_COMMISSION_PERCENT} % s’applique aux ventes.

### Combien coûte ${PLUS_PLAN_NAME} ?

${QUARTERLY} tous les 3 mois, ou ${ANNUAL} par an au lieu de ${ANNUAL_REFERENCE} (−${PLUS_ANNUAL_DISCOUNT_PERCENT} %). ${PLUS_SAME_BENEFITS_NOTE}

### Puis-je essayer ${PLUS_PLAN_NAME} gratuitement ?

Oui, une fois par boutique, pendant ${TRIAL_DAYS} jours, sans paiement ni numéro Wave ou Orange Money.

### Que se passe-t-il après l’essai ?

Sans abonnement, votre boutique repasse au forfait Free. Pour conserver les avantages d’${PLUS_PLAN_NAME}, abonnez-vous depuis votre espace « Mon abonnement ».

### Que se passe-t-il à la fin d’un abonnement payé ?

Vos données et vos produits sont conservés. Jusqu’au renouvellement, votre boutique est soumise aux limites de Free : ${FREE_PRODUCT_LIMIT} produits publiés et commission de ${FREE_COMMISSION_PERCENT} %.

### La commission change-t-elle pendant une promotion ?

Non : ${FREE_COMMISSION_PERCENT} % avec Free, ${PREMIUM_COMMISSION_PERCENT} % avec ${PLUS_PLAN_NAME}, calculés sur le prix après réduction et jamais sur les frais de livraison.

### Comment payer ${PLUS_PLAN_NAME} ?

Par Wave ou Orange Money, depuis votre espace « Mon abonnement ». Le paiement en ligne est en cours d’activation.

### Comment suis-je payé pour mes ventes ?

Depuis l’espace Finances : vous y voyez vos ventes, la commission Ezial et votre montant net, et vous demandez le paiement de votre solde disponible.

Les règles applicables aux vendeurs figurent dans les [conditions générales](/info/conditions-generales/?section=vendeurs-formules-et-commissions).`,
};

// French typography: a no-break space before : ; ? ! % » and after «, and
// between a number and its unit (48 h, 6 000 FCFA), so a line never starts
// with a lone sign. Applied to visible texts only (not to links or meta tags).
const NBSP = '\u00a0';
function typo(text) {
  return String(text)
    .replace(/ ([:;?!%»])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/(\d) (h|FCFA)\b/g, `$1${NBSP}$2`);
}
const TEXT_KEYS = new Set(['title', 'text', 'label', 'value', 'linkLabel']);
function typoDeep(value, key) {
  if (typeof value === 'string') return TEXT_KEYS.has(key) ? typo(value) : value;
  if (Array.isArray(value)) return value.map((v) => typoDeep(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typoDeep(v, k)]));
  }
  return value;
}
function finalize(page) {
  return {
    ...page,
    title: typo(page.title),
    intro: page.intro ? typo(page.intro) : undefined,
    markdown: typo(page.markdown),
    blocks: page.blocks ? typoDeep(page.blocks) : undefined,
  };
}

export const INFO_PAGES = [
  aPropos,
  commentCaMarche,
  livraison,
  paiement,
  contact,
  centreAide,
  conditionsGenerales,
  retours,
  confidentialite,
  mentionsLegales,
  tarifsVendeurs,
].map(finalize);

export function getInfoPage(slug) {
  // A route may still carry a #fragment or a query: only the slug counts.
  const key = String(slug ?? '').split(/[?#]/)[0];
  return INFO_PAGES.find((p) => p.slug === key || (p.aliases ?? []).includes(key)) ?? null;
}

const BLOCK_LINE = /^\{\{([A-Za-z0-9_-]+)\}\}$/;

// Body of a page in display order: Markdown segments and structured blocks.
export function getInfoSegments(page) {
  const segments = [];
  let buffer = [];
  const flush = () => {
    const markdown = buffer.join('\n').trim();
    if (markdown) segments.push({ type: 'markdown', markdown });
    buffer = [];
  };
  for (const line of String(page.markdown ?? '').split('\n')) {
    const m = BLOCK_LINE.exec(line.trim());
    const block = m ? page.blocks?.[m[1]] : undefined;
    if (block) {
      flush();
      segments.push({ type: 'block', id: m[1], block });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
}

// Every heading of the page (ids as rendered), in order.
export function getInfoHeadings(page) {
  return getInfoSegments(page)
    .filter((s) => s.type === 'markdown')
    .flatMap((s) => parseMarkdown(s.markdown).headings);
}
