import { useState } from 'react';
import { formatFCFA, formatDate } from '../../data';
import {
  submitPayoutMethod, maskWalletPhone, providerLabel, PAYOUT_STATUS_LABELS,
  type SellerPaymentSummary, type PayoutMethod, type SellerPayout, type PaymentProvider, type SellerPayoutStatus,
} from '@/lib/supabasePayments';
import { Loader2, Check, Clock, Smartphone } from 'lucide-react';

// « Mes paiements » du vendeur, affiché seulement quand le module paiements
// est installé. Tout est en lecture seule (montants calculés par le serveur) ;
// la seule action est l'envoi d'un numéro Wave / Orange Money, validé ensuite
// par l'équipe Ezial.

export function SellerPaymentCards({ summary, commissionHint }: { summary: SellerPaymentSummary; commissionHint: string }) {
  const cards: { label: string; value: number; hint?: string; accent?: boolean }[] = [
    { label: 'Total des ventes', value: summary.grossSales },
    { label: 'Commissions prélevées', value: summary.commissions, hint: commissionHint },
    { label: 'Net gagné', value: summary.netEarned, accent: true },
    { label: 'En attente', value: summary.pending, hint: 'Paiement ou livraison à confirmer' },
    { label: 'Disponible au versement', value: summary.available },
    { label: 'En cours de transfert', value: summary.inTransfer },
    { label: 'Déjà versé', value: summary.paidOut },
    { label: 'Annulé ou remboursé', value: summary.cancelledOrRefunded },
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">Mes paiements</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`card p-4 ${c.accent ? 'bg-burgundy/5' : ''}`}>
            <p className="text-xs font-medium text-ink/50">{c.label}</p>
            <p className={`mt-1.5 font-display text-xl font-semibold ${c.accent ? 'text-burgundy' : 'text-ink'}`}>{formatFCFA(c.value)}</p>
            {c.hint && <p className="mt-1 text-[11px] leading-snug text-ink/40">{c.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

const payoutStatusStyles: Record<SellerPayoutStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  processing: 'bg-violet-50 text-violet-700',
  unknown: 'bg-amber-50 text-amber-700',
  succeeded: 'bg-green-50 text-green-700',
  failed: 'bg-burgundy/10 text-burgundy',
  blocked: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-ink/5 text-ink/50',
};

export function PayoutStatusBadge({ status }: { status: SellerPayoutStatus }) {
  return (
    <span className={`inline-block flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${payoutStatusStyles[status] ?? 'bg-ink/5 text-ink/55'}`}>
      {PAYOUT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function SellerPayoutHistory({ payouts }: { payouts: SellerPayout[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-ink">Historique des versements</h2>
      <div className="card divide-y divide-line">
        {payouts.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink/45">Aucun versement pour le moment</p>
        ) : (
          payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{formatFCFA(p.amount)}</p>
                <p className="mt-0.5 text-xs text-ink/45">
                  {formatDate(p.completedAt ?? p.createdAt)} · {providerLabel(p.provider)}
                </p>
              </div>
              <PayoutStatusBadge status={p.status} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// Un compte Wave et/ou un compte Orange Money. Les ventes payées par Wave
// sont versées sur Wave, celles payées par Orange Money sur Orange Money ;
// avec un seul compte, tout y est versé (payout_provider_for_sale, serveur).
export function SellerPayoutMethodCard({
  methods, onSubmitted,
}: { methods: PayoutMethod[]; onSubmitted: () => Promise<void> }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Mes informations de paiement</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink/55">
          Les ventes payées par Wave vous sont versées sur Wave, celles payées par Orange Money sur Orange Money. Avec un seul compte, tout y est versé.
        </p>
      </div>
      <div className="divide-y divide-line">
        {(['wave', 'orange_money'] as PaymentProvider[]).map((p) => (
          <ProviderAccount
            key={p}
            provider={p}
            approved={methods.find((m) => m.provider === p && m.status === 'approved') ?? null}
            pending={methods.find((m) => m.provider === p && m.status === 'pending_review') ?? null}
            onSubmitted={onSubmitted}
          />
        ))}
      </div>
    </section>
  );
}

function ProviderAccount({
  provider, approved, pending, onSubmitted,
}: { provider: PaymentProvider; approved: PayoutMethod | null; pending: PayoutMethod | null; onSubmitted: () => Promise<void> }) {
  const [formOpen, setFormOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [holderName, setHolderName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const label = providerLabel(provider);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) { setError('Votre autorisation est nécessaire pour recevoir les versements.'); return; }
    if (!phone.trim()) { setError(`Indiquez votre numéro ${label}.`); return; }
    setSubmitting(true);
    setError('');
    const result = await submitPayoutMethod({ provider, phone, holderName, consent });
    setSubmitting(false);
    if (!result.supported) { setError('Cette fonctionnalité n’est pas encore disponible.'); return; }
    if ('error' in result) { setError(result.error); return; }
    setPhone('');
    setHolderName('');
    setConsent(false);
    setFormOpen(false);
    setSent(true);
    await onSubmitted();
  };

  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cream text-burgundy">
            <Smartphone size={17} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">{label}</p>
            {approved ? (
              <>
                <p className="font-mono text-ink/80">{maskWalletPhone(approved.phone)}</p>
                {approved.holderName && <p className="text-xs text-ink/55">Titulaire : {approved.holderName}</p>}
              </>
            ) : !pending && <p className="text-ink/50">Non renseigné</p>}
            {pending && (
              <>
                {!approved && <p className="font-mono text-ink/80">{maskWalletPhone(pending.phone)}</p>}
                <p className="mt-1 text-xs font-medium text-amber-700">
                  <Clock size={13} className="mr-1 inline-block align-[-2px]" />
                  {approved ? <>Nouveau numéro <span className="whitespace-nowrap font-mono">{maskWalletPhone(pending.phone)}</span> en attente de validation</> : 'En attente de validation'}
                </p>
              </>
            )}
          </div>
        </div>
        {!formOpen && (
          <button type="button" onClick={() => { setFormOpen(true); setSent(false); }} className="btn-outline flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs">
            {approved || pending ? 'Changer' : 'Ajouter'}
          </button>
        )}
      </div>
      {sent && !formOpen && (
        <p className="flex items-center gap-1.5 text-sm text-green-700"><Check size={15} /> Numéro envoyé pour validation.</p>
      )}

      {formOpen && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 rounded-xl bg-cream/40 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">Numéro {label}</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="77 123 45 67"
              className="input-field"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">Nom du titulaire (facultatif)</span>
            <input type="text" autoComplete="name" value={holderName} onChange={(e) => setHolderName(e.target.value)} className="input-field" />
          </label>
          <label className="flex items-start gap-2.5 text-sm text-ink/75">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-burgundy" required />
            <span>J’autorise Ezial à verser mes revenus sur ce compte {label}</span>
          </label>
          {error && <p className="text-sm text-burgundy">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={submitting || !consent || !phone.trim()} className="btn-primary">
              {submitting && <Loader2 size={15} className="animate-spin" />} Envoyer pour validation
            </button>
            <button type="button" onClick={() => { setFormOpen(false); setError(''); }} className="btn-outline">Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
