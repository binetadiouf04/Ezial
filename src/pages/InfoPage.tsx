import { useApp } from '@/store/AppContext';
import { paymentMethods } from '@/data/payments';
import { ArrowLeft } from 'lucide-react';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg font-semibold text-ink mt-7 mb-2.5 first:mt-0">{children}</h2>;
}

const LAST_UPDATED = 'Dernière mise à jour : 11 octobre 2026';

const infoContent: Record<string, { title: string; body: React.ReactNode }> = {
  'a-propos': {
    title: 'À propos',
    body: (
      <>
        <p>Ezial est la marketplace mode & beauté au Sénégal. Nous connectons les créateurs, boutiques et vendeurs sénégalais aux clients à travers tout Dakar et ses environs.</p>
        <p>Notre mission est de valoriser le savoir-faire local et de rendre la mode, la beauté et les soins capillaires accessibles à tous, avec une livraison rapide et un service client de proximité.</p>
      </>
    ),
  },
  'comment-ca-marche': {
    title: 'Comment ça marche',
    body: (
      <>
        <p>1. Parcourez les boutiques et produits sur Ezial.</p>
        <p>2. Ajoutez vos articles au panier. Vous pouvez commander chez plusieurs boutiques en une seule commande.</p>
        <p>3. Choisissez la livraison Ezial ou le retrait en boutique.</p>
        <p>4. Payez avec Wave, Orange Money ou PayPal.</p>
        <p>5. Suivez votre commande en temps réel jusqu'à la réception.</p>
      </>
    ),
  },
  'livraison': {
    title: 'Livraison & retrait',
    body: (
      <>
        <p><strong>Livraison Ezial</strong> — Nous livrons à Dakar et ses environs. Les frais dépendent de votre zone. Ezial vise une livraison sous 24 heures à Dakar pour les commandes éligibles ; il s'agit d'un objectif opérationnel, communiqué à titre indicatif et non d'une garantie applicable à toutes les situations.</p>
        <p><strong>Retrait en boutique</strong> — Certaines boutiques proposent le retrait direct. Le délai de préparation est indiqué sur chaque produit.</p>
      </>
    ),
  },
  'paiement': {
    title: 'Paiement',
    body: (
      <>
        <p>Ezial accepte les moyens de paiement suivants :</p>
        {paymentMethods.map((p) => <p key={p.id}>• <strong>{p.label}</strong></p>)}
        <p>Le paiement est sécurisé et confirmé instantanément.</p>
        <p>Ezial ne demande jamais à ses clients de transmettre leur code PIN, leur mot de passe bancaire ou un code secret de paiement. Toute anomalie peut être signalée au service client pour vérification.</p>
      </>
    ),
  },
  'contact': {
    title: 'Nous contacter',
    body: (
      <>
        <p>Une question ? Notre équipe est là pour vous aider.</p>
        <p>• Email : contact@ezial.net</p>
        <p>Nous répondons généralement sous 24h.</p>
      </>
    ),
  },
  'centre-aide': {
    title: 'Centre d\'aide',
    body: (
      <>
        <p>Bienvenue dans le centre d'aide Ezial. Trouvez rapidement les réponses à vos questions.</p>

        <H2>Quand recevrai-je ma commande ?</H2>
        <p>Ezial vise une livraison sous 24 heures à Dakar pour les commandes éligibles. Une estimation est communiquée lors de l'achat.</p>

        <H2>Puis-je commander dans plusieurs boutiques ?</H2>
        <p>Oui. Ezial permet de réunir des produits de différentes boutiques dans une même commande et coordonne leur livraison selon les modalités annoncées.</p>

        <H2>Puis-je échanger un article dont la taille ne me convient pas ?</H2>
        <p>Oui, un échange peut être demandé selon les tailles disponibles et les conditions applicables. Le droit légal de rétractation reste préservé.</p>

        <H2>Que faire si mon article est abîmé ou incorrect ?</H2>
        <p>Depuis votre commande, sélectionnez « Signaler un problème » et décrivez la situation. Vous pouvez également écrire à contact@ezial.net.</p>

        <H2>Combien de temps ai-je pour demander un retour ?</H2>
        <p>Le droit légal de rétractation est en principe de sept jours ouvrables après réception, sauf exceptions prévues par la réglementation.</p>

        <H2>Que faire si je n'ai pas reçu ma commande ?</H2>
        <p>Signalez le problème depuis votre espace client ou contactez le service client. Ezial vérifiera la livraison et recherchera une solution adaptée.</p>

        <H2>Comment suivre mon remboursement ?</H2>
        <p>L'état de votre demande est consultable depuis votre compte. Vous recevez une information lorsqu'une décision est prise et lorsque le remboursement est effectué.</p>

        <H2>Comment signaler une boutique ?</H2>
        <p>Vous pouvez utiliser la fonction de signalement disponible sur la plateforme ou contacter le service client.</p>
      </>
    ),
  },
  'conditions-generales': {
    title: 'Conditions générales de vente et d\'utilisation',
    body: (
      <>
        <p className="text-xs text-ink/45">{LAST_UPDATED}</p>

        <H2>Présentation d'Ezial</H2>
        <p>Ezial est une marketplace sénégalaise permettant aux consommateurs de découvrir et d'acheter des produits proposés par différentes boutiques partenaires ainsi que par la boutique exploitée directement par Ezial.</p>
        <p>Chaque fiche produit identifie la boutique qui propose l'article. Ezial assure le fonctionnement de la plateforme, la coordination des commandes et les services associés selon les modalités présentées au client.</p>

        <H2>Produits et prix</H2>
        <p>Les vendeurs doivent fournir des descriptions exactes et des photographies fidèles des produits proposés. Les caractéristiques essentielles, les variantes disponibles et le prix sont présentés avant l'achat.</p>
        <p>Les prix sont affichés en francs CFA. Les frais de livraison et les éventuels autres frais sont communiqués avant la validation de la commande.</p>

        <H2>Commandes</H2>
        <p>Le client peut consulter son panier, modifier les quantités, corriger ses informations et vérifier le montant total avant de confirmer son achat.</p>
        <p>Une confirmation de commande est mise à sa disposition. En cas d'indisponibilité d'un produit, Ezial informe le client et organise une solution appropriée, notamment un remplacement accepté ou un remboursement.</p>

        <H2>Paiements</H2>
        <p>Les moyens de paiement disponibles sont indiqués lors de la commande. Ezial ne demande jamais aux clients de transmettre leur code PIN, leur mot de passe bancaire ou un code secret de paiement.</p>
        <p>Toute anomalie de paiement peut être signalée au service client pour vérification.</p>

        <H2>Livraison</H2>
        <p>Les zones desservies, les frais applicables et les estimations de livraison sont indiqués avant la validation de la commande.</p>
        <p>Ezial vise une livraison sous 24 heures à Dakar pour les commandes éligibles. Il s'agit d'un objectif opérationnel et non d'une garantie applicable à toutes les situations.</p>
        <p>Lorsqu'une commande comprend plusieurs boutiques, Ezial coordonne la collecte des articles et organise leur livraison selon les modalités annoncées au client.</p>

        <H2>Retours et remboursements</H2>
        <p>Les conditions applicables sont détaillées dans la <button onClick={() => window.location.hash = '/info/retours'} className="text-burgundy hover:underline">politique de retour et de remboursement</button> d'Ezial, accessible avant l'achat.</p>
        <p>Les droits légaux du consommateur prévalent sur toute condition commerciale contraire.</p>

        <H2>Comptes et utilisation</H2>
        <p>Les utilisateurs doivent fournir des informations exactes et préserver la confidentialité de leurs accès.</p>
        <p>Les fraudes, les faux avis, l'utilisation abusive des données personnelles et les comportements contraires à la loi sont interdits.</p>
        <p>Ezial peut prendre des mesures proportionnées contre les comptes ou boutiques ne respectant pas ces règles, sans supprimer les droits relatifs aux commandes déjà effectuées.</p>

        <H2>Réclamations et litiges</H2>
        <p>Toute réclamation peut être adressée à contact@ezial.net.</p>
        <p>Ezial recherche prioritairement une solution amiable. Le consommateur conserve le droit de saisir les autorités ou juridictions compétentes.</p>
        <p>Les présentes conditions sont soumises au droit sénégalais, sous réserve des dispositions impératives applicables.</p>
      </>
    ),
  },
  'retours': {
    title: 'Retours, échanges et remboursements',
    body: (
      <>
        <p className="text-xs text-ink/45">{LAST_UPDATED}</p>

        <H2>Notre engagement</H2>
        <p>Ezial souhaite garantir aux consommateurs une expérience d'achat transparente et un traitement équitable des difficultés rencontrées après une commande.</p>

        <H2>Droit de rétractation</H2>
        <p>Conformément au décret sénégalais n° 2008-718 relatif au commerce électronique, le consommateur dispose en principe de sept jours ouvrables à compter de la réception d'un produit pour exercer son droit de rétractation, sans avoir à justifier sa décision et sans pénalité.</p>
        <p>Certaines exceptions prévues par la réglementation peuvent s'appliquer, notamment à des produits personnalisés ou à certains biens qui, par leur nature, ne peuvent pas être réexpédiés.</p>
        <p>Le client peut notifier sa décision depuis son espace de commande ou par courrier électronique à contact@ezial.net. Une confirmation écrite de la demande lui est adressée.</p>

        <H2>Remboursement après rétractation</H2>
        <p>Lorsqu'une rétractation est valablement exercée, Ezial organise le traitement du remboursement dans les conditions prévues par la réglementation sénégalaise.</p>
        <p>Le décret n° 2008-718 prévoit notamment un remboursement au plus tard dans les quinze jours suivant la réception de la notification de rétractation, sans frais et selon les conditions de paiement applicables.</p>
        <p>Les frais directs de retour peuvent être à la charge du consommateur dans les conditions prévues par la loi. Ils ne sont pas à sa charge lorsque le fournisseur n'a pas livré le bon produit.</p>

        <H2>Échanges pour problème de taille</H2>
        <p>Lorsqu'un client souhaite une autre taille, il peut demander un échange.</p>
        <p>Ezial vérifie la disponibilité de la nouvelle taille et organise l'échange avec la boutique concernée. Les conditions pratiques et les éventuels frais sont communiqués avant confirmation.</p>
        <p>Si le vendeur a envoyé une taille différente de celle commandée, les frais nécessaires à la correction de cette erreur ne sont pas supportés par le client.</p>
        <p>L'échange constitue une solution proposée au consommateur et ne remplace pas son droit légal de rétractation lorsqu'il est applicable.</p>

        <H2>Produits défectueux ou non conformes</H2>
        <p>Lorsqu'un article est défectueux, endommagé, incomplet ou différent de sa description, le client peut déposer une réclamation.</p>
        <p>Ezial examine le problème avec le vendeur et organise une solution adaptée aux droits du consommateur : correction, échange, remplacement ou remboursement.</p>

        <H2>Signalement dans les 48 heures</H2>
        <p>Pour faciliter une prise en charge rapide, Ezial recommande de signaler les problèmes visibles dans les 48 heures suivant la réception.</p>
        <p>Ce délai constitue une recommandation de service. Il ne supprime pas les droits légaux du consommateur et ne permet pas de refuser automatiquement une réclamation ultérieure.</p>

        <H2>Produits de beauté et articles particuliers</H2>
        <p>Les éventuelles restrictions de retour doivent correspondre à une exception légalement applicable et être clairement indiquées sur la fiche produit avant l'achat.</p>
        <p>Aucune catégorie entière ne doit être exclue automatiquement du droit de rétractation sans vérification juridique.</p>

        <H2>Commandes de plusieurs boutiques</H2>
        <p>Lorsqu'un problème concerne un seul article d'une commande regroupant plusieurs boutiques, Ezial peut traiter une réclamation ou un remboursement partiel sans annuler les autres articles.</p>

        <H2>Comment faire une demande ?</H2>
        <p>Le client peut utiliser la fonctionnalité « Signaler un problème » ou « Demander un retour ou un échange » depuis sa commande, ou écrire à contact@ezial.net.</p>
        <p>Il doit indiquer les articles concernés et décrire le problème. Des photographies peuvent être demandées lorsqu'elles sont utiles au traitement du dossier.</p>
        <p>Le client est informé de l'avancement de sa demande jusqu'à sa résolution.</p>
      </>
    ),
  },
  'confidentialite': {
    title: 'Politique de confidentialité',
    body: (
      <>
        <p className="text-xs text-ink/45">{LAST_UPDATED}</p>

        <H2>Protection des données</H2>
        <p>Ezial traite les données personnelles nécessaires au fonctionnement de sa marketplace conformément à la législation sénégalaise applicable, notamment la loi n° 2008-12 relative à la protection des données à caractère personnel.</p>

        <H2>Informations collectées</H2>
        <p>Selon les services utilisés, Ezial peut traiter les informations d'identification et de contact, les adresses de livraison, les informations de commande, les préférences exprimées et certaines données techniques nécessaires à la sécurité et au fonctionnement du site.</p>

        <H2>Finalités du traitement</H2>
        <p>Ces données servent à gérer les comptes, exécuter les commandes, organiser les livraisons, traiter les paiements et remboursements, répondre aux réclamations et prévenir les utilisations frauduleuses.</p>
        <p>Les communications commerciales sont soumises aux règles applicables et aux choix exprimés par les utilisateurs.</p>

        <H2>Partage des données</H2>
        <p>Les informations nécessaires à une commande peuvent être transmises aux boutiques concernées, aux livreurs et aux prestataires techniques ou de paiement intervenant dans sa réalisation.</p>
        <p>Les vendeurs et livreurs ne sont pas autorisés à réutiliser les coordonnées des clients pour des sollicitations personnelles ou commerciales non autorisées.</p>
        <p>Ezial ne commercialise pas les données personnelles de ses utilisateurs.</p>

        <H2>Conservation et sécurité</H2>
        <p>Les données sont conservées pendant les durées nécessaires à leurs finalités et aux obligations légales applicables.</p>
        <p>Ezial met en place des mesures techniques et organisationnelles destinées à limiter les accès non autorisés, les pertes de données et les divulgations injustifiées.</p>

        <H2>Droits des personnes</H2>
        <p>Les utilisateurs peuvent exercer les droits que leur reconnaît la législation applicable, notamment les droits d'accès, de rectification et, lorsque les conditions légales sont réunies, de suppression ou d'opposition.</p>
        <p>Les demandes peuvent être adressées à contact@ezial.net.</p>

        <H2>Cookies et mesure d'audience</H2>
        <p>Ezial peut utiliser des technologies nécessaires au fonctionnement de son site et, lorsque cela est activé, des outils de mesure d'audience ou de marketing.</p>
        <p>Les utilisateurs reçoivent les informations nécessaires et leur consentement est recueilli lorsqu'il est requis.</p>

        <H2>Prestataires et transferts internationaux</H2>
        <p>Certains prestataires techniques peuvent traiter des données en dehors du Sénégal. Ezial doit vérifier les garanties applicables et accomplir les formalités nécessaires avant tout transfert concerné.</p>
        <p>La liste des prestataires réellement utilisés et les informations complémentaires obligatoires doivent être documentées avant publication définitive.</p>

        <H2>Contact</H2>
        <p>Toute question relative aux données personnelles peut être adressée à contact@ezial.net.</p>
      </>
    ),
  },
  'mentions-legales': {
    title: 'Mentions légales',
    body: (
      <>
        {/* Only real, confirmed information is published here — RCCM,
           NINEA, exploitant's legal name, professional address and phone
           are not yet filled in administratively, and a legal page must
           never show placeholder brackets or invented values. These
           fields are added as soon as they're provided (see the
           administrator report), not fabricated in the meantime. */}
        <p>Le site www.ezial.net est exploité sous le nom commercial Ezial.</p>
        <p>Courriel : contact@ezial.net</p>

        <H2>Hébergement et prestataires techniques</H2>
        <p>Hébergement du site : GitHub Pages, sous réserve de vérification de l'architecture effectivement déployée.</p>
        <p>Services techniques : Supabase, sous réserve de vérification des prestataires et de leurs rôles.</p>

        <H2>Propriété intellectuelle</H2>
        <p>Les informations, photographies, éléments graphiques et contenus présents sur le site sont protégés conformément aux règles applicables.</p>

        <p className="text-xs text-ink/45 mt-6">Les informations relatives à la forme juridique, à l'immatriculation (RCCM, NINEA) et aux coordonnées professionnelles complètes de l'exploitant seront ajoutées dès leur communication par l'administration d'Ezial.</p>

        <H2>Contact</H2>
        <p>Toute question concernant l'exploitation du site peut être adressée à contact@ezial.net.</p>
      </>
    ),
  },
};

export default function InfoPage({ slug }: { slug: string }) {
  const { navigate } = useApp();
  const content = infoContent[slug];

  if (!content) {
    return (
      <div className="container-pro py-20 text-center">
        <p className="text-ink/50">Page introuvable.</p>
        <button onClick={() => navigate('/')} className="btn-outline mt-4">Retour à l'accueil</button>
      </div>
    );
  }

  return (
    <div className="container-pro py-8 max-w-2xl">
      <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-6">
        <ArrowLeft size={16} /> Accueil
      </button>
      <h1 className="font-display text-3xl font-semibold text-ink mb-6">{content.title}</h1>
      <div className="space-y-4 text-sm text-ink/70 leading-relaxed">
        {content.body}
      </div>
    </div>
  );
}
