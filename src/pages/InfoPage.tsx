import { useApp } from '@/store/AppContext';
import { paymentMethods } from '@/data/payments';
import { ArrowLeft } from 'lucide-react';

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
        <p><strong>Livraison Ezial</strong> — Nous livrons à Dakar et ses environs. Les frais dépendent de votre zone. Délai estimé : 4 à 72h selon la zone.</p>
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
      </>
    ),
  },
  'retours': {
    title: 'Retours & remboursements',
    body: (
      <>
        <p>Vous pouvez demander un retour dans les 48h suivant la réception de votre commande si le produit ne correspond pas ou présente un défaut.</p>
        <p>Le remboursement est traité via votre moyen de paiement initial (Wave, Orange Money ou PayPal).</p>
        <p>Pour toute demande de retour, contactez-nous via le formulaire de contact.</p>
      </>
    ),
  },
  'contact': {
    title: 'Nous contacter',
    body: (
      <>
        <p>Une question ? Notre équipe est là pour vous aider.</p>
        <p>• Email : contact@ezial.sn</p>
        <p>• Téléphone : +221 77 000 00 00</p>
        <p>• Instagram : @ezial.sn</p>
        <p>Nous répondons généralement sous 24h.</p>
      </>
    ),
  },
  'centre-aide': {
    title: 'Centre d\'aide',
    body: (
      <>
        <p>Bienvenue dans le centre d'aide Ezial. Trouvez rapidement les réponses à vos questions.</p>
        <p>Consultez les sections Livraison & retrait, Paiement, et Retours & remboursements pour plus d'informations.</p>
      </>
    ),
  },
  'conditions-generales': {
    title: 'Conditions générales',
    body: (
      <>
        <p>Les présentes conditions générales régissent l'utilisation de la plateforme Ezial.</p>
        <p>Ezial agit en qualité d'intermédiaire entre les vendeurs partenaires et les clients. Les produits sont vendus et expédiés par les boutiques partenaires.</p>
        <p>En passant commande sur Ezial, vous acceptez les présentes conditions.</p>
      </>
    ),
  },
  'confidentialite': {
    title: 'Politique de confidentialité',
    body: (
      <>
        <p>Ezial s'engage à protéger vos données personnelles.</p>
        <p>Nous collectons uniquement les informations nécessaires au traitement de vos commandes : nom, téléphone, adresse de livraison.</p>
        <p>Vos données ne sont jamais partagées avec des tiers à des fins commerciales.</p>
      </>
    ),
  },
  'mentions-legales': {
    title: 'Mentions légales',
    body: (
      <>
        <p>Ezial est une marketplace de mode & beauté opérant au Sénégal.</p>
        <p>Siège social : Dakar, Sénégal.</p>
        <p>© 2026 Ezial — Tous droits réservés.</p>
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
