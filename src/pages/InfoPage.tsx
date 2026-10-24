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
        <p className="text-xs text-ink/45">Dernière mise à jour : 23 octobre 2026</p>

        <H2>1. Éditeur du site</H2>
        <p>Le site internet www.ezial.net est une plateforme de commerce électronique exploitée par une entreprise individuelle immatriculée au Sénégal.</p>
        <p>Les informations relatives à l'entreprise exploitante sont les suivantes :</p>
        <p>• <strong>Plateforme</strong> : Ezial</p>
        <p>• <strong>Exploitante</strong> : Bineta DIOUF</p>
        <p>• <strong>Forme juridique</strong> : Entreprise individuelle</p>
        <p>• <strong>Numéro RCCM</strong> : SN.DKR.2026.A.40238</p>
        <p>• <strong>Numéro NINEA</strong> : 013246576</p>
        <p>• <strong>Adresse professionnelle</strong> : Grand Yoff, quartier Sicap Foire, villa n° 48, Dakar, Sénégal</p>
        <p>• <strong>Adresse électronique</strong> : contact@ezial.net</p>
        <p>• <strong>Téléphone</strong> : +221 71 105 52 52</p>
        <p>• <strong>Site internet</strong> : https://www.ezial.net</p>
        <p>Ezial est une plateforme de vente en ligne permettant à des boutiques et vendeurs partenaires de proposer leurs produits aux consommateurs, principalement au Sénégal.</p>

        <H2>2. Responsable de la publication</H2>
        <p>La responsable de la publication du site est Bineta DIOUF, en sa qualité d'exploitante de l'entreprise individuelle.</p>
        <p>Toute demande concernant le site peut être adressée à : contact@ezial.net.</p>

        <H2>3. Hébergement et infrastructure technique</H2>
        <p>Le site Ezial est hébergé et publié à l'aide du service GitHub Pages, fourni par GitHub, Inc.</p>
        <p>Le fonctionnement de la plateforme repose également sur des services techniques tiers, notamment Supabase pour la gestion de certaines données et fonctionnalités applicatives.</p>
        <p>Les coordonnées légales complètes des prestataires d'hébergement et les informations relatives à la localisation des données sont précisées conformément aux obligations légales applicables.</p>

        <H2>4. Objet de la plateforme</H2>
        <p>Ezial est une marketplace multivendeur facilitant la mise en relation entre les consommateurs et des boutiques partenaires indépendantes.</p>
        <p>La plateforme permet notamment :</p>
        <p>• La consultation de produits et de catalogues de boutiques.</p>
        <p>• La recherche et la sélection de produits.</p>
        <p>• La constitution de paniers regroupant plusieurs boutiques.</p>
        <p>• La passation et le suivi de commandes.</p>
        <p>• Le paiement par les moyens proposés sur le site.</p>
        <p>• L'organisation de la livraison à domicile ou du retrait en boutique.</p>
        <p>• La communication d'informations relatives aux commandes.</p>
        <p>Ezial fournit une infrastructure numérique et des services facilitant les transactions commerciales entre les utilisateurs et les vendeurs partenaires.</p>
        <p>Les modalités précises de chaque transaction sont définies dans les Conditions générales de vente et les conditions applicables aux vendeurs partenaires.</p>

        <H2>5. Informations relatives aux vendeurs partenaires</H2>
        <p>Les produits proposés sur Ezial peuvent être commercialisés par des vendeurs professionnels indépendants.</p>
        <p>Chaque vendeur partenaire est responsable des informations qu'il communique concernant ses produits, notamment :</p>
        <p>• Les descriptions et caractéristiques.</p>
        <p>• Les photographies et illustrations.</p>
        <p>• Les prix et promotions.</p>
        <p>• Les disponibilités et les stocks.</p>
        <p>• La conformité, l'authenticité et la qualité des produits.</p>
        <p>Ezial se réserve le droit de vérifier, modifier, suspendre ou supprimer toute annonce qui ne respecte pas les règles de la plateforme ou la réglementation applicable.</p>
        <p>Cette disposition ne limite pas les responsabilités légales pouvant incomber à Ezial dans le cadre de ses propres prestations.</p>

        <H2>6. Prix et modalités de paiement</H2>
        <p>Les prix affichés sur la plateforme sont exprimés en francs CFA (FCFA).</p>
        <p>Les frais de livraison et les éventuels frais supplémentaires applicables sont communiqués au client avant la validation définitive de sa commande.</p>
        <p>Selon les options effectivement disponibles, les paiements peuvent être réalisés par :</p>
        <p>• Wave.</p>
        <p>• Orange Money.</p>
        <p>• Carte bancaire.</p>
        <p>Les transactions sont soumises aux conditions et aux mesures de sécurité des prestataires de paiement concernés.</p>
        <p>Ezial s'engage à présenter les informations tarifaires de manière claire et transparente, conformément à la réglementation applicable.</p>

        <H2>7. Livraison et retrait des commandes</H2>
        <p>Ezial propose, selon les produits et les boutiques concernés, des services de livraison à domicile et de retrait en boutique.</p>
        <p>Les zones desservies, les délais estimés, les frais applicables et les conditions de retrait sont communiqués au moment de la commande.</p>
        <p>Pour les livraisons à Dakar, Ezial vise un délai de livraison de 24 heures, sous réserve des disponibilités, des conditions logistiques et des informations précisées lors de la commande.</p>
        <p>Les modalités détaillées de livraison, de retrait, de réclamation et de remboursement sont définies dans les politiques commerciales applicables.</p>

        <H2>8. Propriété intellectuelle</H2>
        <p>Le nom Ezial, son logo, son identité visuelle, son interface, ses éléments graphiques et les contenus originaux réalisés pour la plateforme sont protégés par les dispositions applicables en matière de propriété intellectuelle.</p>
        <p>Toute reproduction, modification, distribution ou exploitation non autorisée d'éléments protégés est interdite, sous réserve des exceptions prévues par la loi.</p>
        <p>Les photographies, marques, descriptions et autres contenus fournis par les vendeurs partenaires demeurent la propriété de leurs titulaires respectifs.</p>
        <p>Les vendeurs garantissent disposer des droits ou autorisations nécessaires à l'utilisation des contenus qu'ils publient sur Ezial.</p>

        <H2>9. Protection des données personnelles</H2>
        <p>Dans le cadre de ses activités, Ezial peut être amené à collecter et traiter des données personnelles concernant les clients, vendeurs et livreurs utilisant la plateforme.</p>
        <p>Ces informations peuvent notamment comprendre :</p>
        <p>• Le nom et le prénom.</p>
        <p>• Les coordonnées téléphoniques et électroniques.</p>
        <p>• Les adresses de livraison.</p>
        <p>• Les informations relatives aux commandes.</p>
        <p>• Les données nécessaires à la gestion des comptes et des prestations.</p>
        <p>Ces traitements sont réalisés conformément à la législation sénégalaise applicable, notamment la loi n° 2008-12 du 25 janvier 2008 relative à la protection des données à caractère personnel.</p>
        <p>Les données sont utilisées pour les finalités déterminées et légitimes liées au fonctionnement de la plateforme, à la gestion des commandes, aux paiements, à la livraison, à l'assistance aux utilisateurs et au respect des obligations légales.</p>
        <p>Certaines informations peuvent être transmises aux vendeurs, livreurs ou prestataires techniques lorsque cela est nécessaire à l'exécution des services concernés.</p>
        <p>Les utilisateurs disposent des droits prévus par la législation applicable.</p>
        <p>Pour toute question ou demande concernant leurs données personnelles, ils peuvent contacter : contact@ezial.net.</p>
        <p>Les informations détaillées relatives aux traitements de données figurent dans la <button onClick={() => window.location.hash = '/info/confidentialite'} className="text-burgundy hover:underline">Politique de confidentialité</button> d'Ezial.</p>

        <H2>10. Cookies et technologies similaires</H2>
        <p>Ezial peut utiliser des cookies ou des technologies similaires afin d'assurer le fonctionnement de la plateforme, de maintenir les sessions des utilisateurs et d'améliorer les services proposés.</p>
        <p>Lorsque leur utilisation nécessite un consentement préalable, les technologies non essentielles ne sont activées qu'après obtention de celui-ci.</p>
        <p>Les utilisateurs sont informés des catégories de cookies utilisées et des modalités de gestion de leurs préférences dans la politique correspondante.</p>

        <H2>11. Responsabilité</H2>
        <p>Ezial s'efforce de garantir l'accessibilité, la sécurité et le bon fonctionnement de sa plateforme.</p>
        <p>Des interruptions temporaires peuvent toutefois intervenir en raison d'opérations de maintenance, de mises à jour, d'incidents techniques ou d'événements indépendants de sa volonté.</p>
        <p>Les vendeurs partenaires demeurent responsables de leurs propres obligations commerciales et légales.</p>
        <p>Ezial reste responsable des obligations qui lui incombent en vertu de la réglementation applicable et des engagements contractuels qu'elle assume dans le cadre de ses services.</p>
        <p>Aucune disposition des présentes mentions légales ne peut être interprétée comme excluant une responsabilité qui ne pourrait légalement être écartée.</p>

        <H2>12. Liens vers des services tiers</H2>
        <p>Le site peut contenir des liens vers des sites internet, services de paiement ou plateformes exploités par des tiers.</p>
        <p>Ces services sont soumis à leurs propres conditions d'utilisation et politiques de confidentialité.</p>
        <p>Ezial n'exerce pas nécessairement de contrôle sur leur contenu ou leur fonctionnement et ne saurait être tenue responsable de leurs activités en dehors des obligations qui lui sont légalement applicables.</p>

        <H2>13. Signalements et réclamations</H2>
        <p>Tout utilisateur peut contacter Ezial pour signaler :</p>
        <p>• Une information inexacte ou trompeuse.</p>
        <p>• Un produit suspect ou non conforme.</p>
        <p>• Un contenu portant atteinte à des droits.</p>
        <p>• Une utilisation frauduleuse de la plateforme.</p>
        <p>• Un problème relatif à une commande.</p>
        <p>• Une difficulté concernant la livraison ou le service client.</p>
        <p>Les demandes et réclamations peuvent être adressées à : contact@ezial.net.</p>
        <p>Ezial examine les signalements reçus et prend les mesures appropriées conformément à ses obligations légales et contractuelles.</p>

        <H2>14. Droit applicable</H2>
        <p>Les présentes mentions légales sont régies par la législation applicable au Sénégal, notamment les dispositions relatives aux transactions électroniques, à la protection des données personnelles et aux activités commerciales.</p>
        <p>Tout différend relatif à l'utilisation du site est soumis aux règles de compétence prévues par la législation applicable, sans préjudice des dispositions impératives protégeant les consommateurs.</p>

        <H2>15. Modification des mentions légales</H2>
        <p>Ezial peut actualiser les présentes mentions légales afin de tenir compte de l'évolution de ses services, de sa structure administrative, de ses prestataires ou de la réglementation applicable.</p>
        <p>La version en vigueur est celle publiée sur le site internet, accompagnée de sa date de dernière mise à jour.</p>
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
