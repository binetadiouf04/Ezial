import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Crown, Gift, Loader2, X } from 'lucide-react';
import {
  PREMIUM_GRANT_MODULE_MISSING,
  PREMIUM_GRANT_MONTH_OPTIONS,
  PREMIUM_GRANT_REASON_MAX,
  endPremiumGrant,
  extendPremiumGrant,
  fetchPremiumGrantHistory,
  fetchShopPremiumGrants,
  grantPremium,
  type PremiumGrant,
  type PremiumGrantEvent,
  type PremiumGrantMonths,
  type PremiumGrantStatus,
} from '@/lib/supabasePremiumGrants';
import { FREE_COMMISSION_PERCENT, FREE_PRODUCT_LIMIT, PLUS_PLAN_NAME, PREMIUM_COMMISSION_PERCENT } from '@/data/subscriptionPlans';

// Offrir un accès Ezial Plus gratuit (3 ou 6 mois) à une boutique partenaire.
// Indépendant de l'essai standard de 30 jours. Toutes les écritures passent par
// des fonctions réservées aux administrateurs (vérifiées côté serveur) ; la
// section se masque proprement tant que la migration n'est pas exécutée.

type Pending = { kind: 'grant'; months: PremiumGrantMonths } | { kind: 'extend'; months: PremiumGrantMonths } | { kind: 'end' };

const DAY_MS = 86_400_000;

const STATUS_CHIP: Record<PremiumGrantStatus, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-green-50 text-green-700 border-green-100' },
  expired: { label: 'Terminé', className: 'bg-ink/5 text-ink/60 border-line' },
  ended_early: { label: 'Interrompu', className: 'bg-orange-50 text-orange-700 border-orange-100' },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysLeft(endsAt: string): number {
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / DAY_MS));
}

function monthsLabel(n: number): string {
  return `${n} mois`;
}

function eventLabel(event: PremiumGrantEvent, grant: PremiumGrant | undefined): string {
  switch (event.action) {
    case 'premium_grant_created':
      return `Accès offert pour ${monthsLabel(event.months ?? grant?.grantedMonths ?? 0)}`;
    case 'premium_grant_extended':
      return event.months ? `Prolongé de ${monthsLabel(event.months)}` : 'Prolongé';
    case 'premium_grant_ended':
      return event.backToFree === false ? 'Interrompu' : 'Interrompu · retour à Free';
    case 'premium_grant_expired':
      return 'Expiré automatiquement';
    default:
      return event.action;
  }
}

function actorLabel(actorKind: string): string {
  return actorKind === 'system' ? 'Automatique' : 'Administrateur';
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${selected ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/30'}`}
    >
      {children}
    </button>
  );
}

function ReasonField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink/60">Motif (facultatif)</label>
      <textarea
        id={id}
        className="input-field"
        rows={2}
        maxLength={PREMIUM_GRANT_REASON_MAX}
        placeholder="Partenariat, collaboration…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-right text-xs text-ink/40">{value.length} / {PREMIUM_GRANT_REASON_MAX}</p>
    </div>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Fermer" className="flex-shrink-0 p-1"><X size={18} className="text-ink/40" /></button>
        </div>
        <div className="space-y-3 text-sm text-ink/75">{children}</div>
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> <span className="min-w-0 break-words">{error}</span>
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-outline flex-1">Annuler</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-primary flex-1">
            {busy && <Loader2 size={15} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPremiumGrantsSection({ shopId, shopName, shopIsOfficial }: { shopId: string; shopName: string; shopIsOfficial: boolean }) {
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grants, setGrants] = useState<PremiumGrant[]>([]);
  const [events, setEvents] = useState<PremiumGrantEvent[]>([]);
  const [months, setMonths] = useState<PremiumGrantMonths>(3);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [modalReason, setModalReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (shopIsOfficial) { setLoading(false); return; }
    setLoadError('');
    const g = await fetchShopPremiumGrants(shopId);
    if (!g.supported) { setSupported(false); setLoading(false); return; }
    if ('error' in g) { setLoadError(g.error); setLoading(false); return; }
    setSupported(true);
    setGrants(g.grants);
    const h = await fetchPremiumGrantHistory(g.grants.map((x) => x.id));
    if (h.supported && 'events' in h) setEvents(h.events);
    else if (h.supported && 'error' in h) setLoadError(h.error);
    setLoading(false);
  }, [shopId, shopIsOfficial]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => grants.find((g) => g.status === 'active') ?? null, [grants]);
  const grantsById = useMemo(() => new Map(grants.map((g) => [g.id, g])), [grants]);

  const closeModal = () => {
    if (busy) return;
    setPending(null);
    setModalReason('');
    setActionError('');
  };

  const openModal = (p: Pending) => {
    setNotice('');
    setActionError('');
    setModalReason('');
    setPending(p);
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setActionError('');
    let message = '';
    let failure = '';
    let missing = false;

    if (pending.kind === 'grant') {
      const r = await grantPremium(shopId, pending.months, reason);
      if (!r.supported) missing = true;
      else if ('error' in r) failure = r.error;
      else message = `Accès ${PLUS_PLAN_NAME} offert pour ${monthsLabel(pending.months)}${r.endsAt ? `, jusqu’au ${formatDate(r.endsAt)}` : ''}.`;
    } else if (pending.kind === 'extend') {
      if (!active) { setBusy(false); return; }
      const r = await extendPremiumGrant(active.id, pending.months, modalReason);
      if (!r.supported) missing = true;
      else if ('error' in r) failure = r.error;
      else message = `Accès prolongé de ${monthsLabel(pending.months)}${r.endsAt ? `, jusqu’au ${formatDate(r.endsAt)}` : ''}.`;
    } else {
      if (!active) { setBusy(false); return; }
      const r = await endPremiumGrant(active.id, modalReason);
      if (!r.supported) missing = true;
      else if ('error' in r) failure = r.error;
      else message = r.backToFree ? 'Accès interrompu : la boutique est repassée à Free.' : 'Accès interrompu. La boutique garde son abonnement en cours.';
    }

    if (missing) { setSupported(false); setPending(null); setBusy(false); return; }
    if (failure) { setActionError(failure); setBusy(false); return; }

    setBusy(false);
    setPending(null);
    setModalReason('');
    setReason('');
    setNotice(message);
    await load();
  };

  const cardTitle = (
    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
      <Gift size={15} className="flex-shrink-0 text-burgundy" /> Offrir un accès {PLUS_PLAN_NAME}
    </h2>
  );

  if (shopIsOfficial) {
    return (
      <section className="card space-y-2 p-4 sm:p-5">
        {cardTitle}
        <p className="flex items-start gap-1.5 text-sm text-ink/65">
          <Crown size={14} className="mt-0.5 flex-shrink-0 text-burgundy" />
          <span>Boutique officielle Ezial : elle est toujours {PLUS_PLAN_NAME}, aucun accès offert n’est nécessaire.</span>
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="card space-y-3 p-4 sm:p-5">
        {cardTitle}
        <Loader2 size={18} className="animate-spin text-ink/30" />
      </section>
    );
  }

  if (!supported) {
    return (
      <section className="card space-y-2 p-4 sm:p-5">
        {cardTitle}
        <p className="text-sm text-ink/55">{PREMIUM_GRANT_MODULE_MISSING}</p>
      </section>
    );
  }

  // Dates estimées affichées dans la fenêtre de confirmation : la date exacte est fixée par le serveur.
  const estimatedEnd = (() => {
    if (!pending || pending.kind === 'end') return null;
    const base = pending.kind === 'extend' && active ? new Date(active.endsAt) : new Date();
    return addMonths(Number.isNaN(base.getTime()) ? new Date() : base, pending.months);
  })();

  const commissionNote = `Gratuit : le vendeur ne paie pas l’abonnement, les commissions sur ses ventes restent applicables (${PREMIUM_COMMISSION_PERCENT} %).`;

  return (
    <section className="space-y-3">
      <div className="card space-y-4 p-4 sm:p-5">
        {cardTitle}

        {notice && (
          <p role="status" className="flex items-start gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" /> <span className="min-w-0">{notice}</span>
          </p>
        )}
        {loadError && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> <span className="min-w-0">{loadError}</span>
          </p>
        )}

        {active ? (
          <div className="space-y-3 rounded-xl border border-burgundy/20 bg-burgundy/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-burgundy">
              <Crown size={14} className="flex-shrink-0" /> Accès {PLUS_PLAN_NAME} offert actif
            </p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink/55">Début</dt><dd className="text-right font-medium text-ink">{formatDate(active.startsAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink/55">Fin</dt><dd className="text-right font-medium text-ink">{formatDate(active.endsAt)}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink/55">Jours restants</dt>
                <dd className="text-right font-medium text-ink">{daysLeft(active.endsAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink/55">Durée offerte</dt>
                <dd className="text-right font-medium text-ink">
                  {monthsLabel(active.grantedMonths)}
                  {active.extendedMonths > 0 ? ` + ${monthsLabel(active.extendedMonths)} de prolongation` : ''}
                </dd>
              </div>
              {active.reason && (
                <div className="flex justify-between gap-4"><dt className="flex-shrink-0 text-ink/55">Motif</dt><dd className="min-w-0 break-words text-right text-ink">{active.reason}</dd></div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              {PREMIUM_GRANT_MONTH_OPTIONS.map((m) => (
                <button key={m} type="button" onClick={() => openModal({ kind: 'extend', months: m })} className="btn-outline flex-1 whitespace-nowrap px-4 py-2.5">
                  Prolonger de {monthsLabel(m)}
                </button>
              ))}
              <button type="button" onClick={() => openModal({ kind: 'end' })} className="btn-danger w-full px-4 py-2.5">
                Mettre fin à l’accès
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink/65">
              Offrez un accès {PLUS_PLAN_NAME} gratuit à cette boutique (partenaire, collaboration). Il est indépendant de l’essai gratuit standard.
            </p>
            <div role="radiogroup" aria-label="Durée offerte" className="flex gap-2">
              {PREMIUM_GRANT_MONTH_OPTIONS.map((m) => (
                <ChoiceButton key={m} selected={months === m} onClick={() => setMonths(m)}>{m} mois gratuits</ChoiceButton>
              ))}
            </div>
            <ReasonField id="grant-reason" value={reason} onChange={setReason} />
            <button type="button" onClick={() => openModal({ kind: 'grant', months })} className="btn-primary w-full sm:w-auto">
              Offrir l’accès
            </button>
          </div>
        )}
      </div>

      {grants.length > 0 && (
        <div className="card space-y-4 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">Historique des accès offerts</h3>
          <ul className="space-y-4">
            {grants.map((g) => {
              const chip = STATUS_CHIP[g.status];
              const grantEvents = events.filter((e) => e.grantId === g.id);
              return (
                <li key={g.id} className="space-y-2 border-b border-line pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span>
                    <span className="text-sm font-medium text-ink">
                      {monthsLabel(g.grantedMonths)}{g.extendedMonths > 0 ? ` + ${monthsLabel(g.extendedMonths)}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-ink/55">
                    Du {formatDate(g.startsAt)} au {formatDate(g.status === 'ended_early' && g.endedAt ? g.endedAt : g.endsAt)}
                  </p>
                  {g.reason && <p className="break-words text-xs text-ink/65">Motif : {g.reason}</p>}
                  {g.endReason && <p className="break-words text-xs text-ink/65">Motif de fin : {g.endReason}</p>}
                  {grantEvents.length > 0 && (
                    <ul className="space-y-1.5 border-l-2 border-line pl-3">
                      {grantEvents.map((e) => (
                        <li key={e.id} className="text-xs text-ink/70">
                          <p className="font-medium text-ink">{eventLabel(e, grantsById.get(e.grantId))}</p>
                          <p className="text-ink/45">{formatDateTime(e.occurredAt)} · {actorLabel(e.actorKind)}</p>
                          {e.reason && <p className="break-words text-ink/60">Motif : {e.reason}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pending?.kind === 'grant' && estimatedEnd && (
        <ConfirmModal
          title={`Offrir ${monthsLabel(pending.months)} gratuits`}
          confirmLabel="Offrir l’accès"
          busy={busy}
          error={actionError}
          onCancel={closeModal}
          onConfirm={() => void confirm()}
        >
          <p>
            La boutique <strong className="text-ink">{shopName}</strong> recevra un accès {PLUS_PLAN_NAME} gratuit de <strong className="text-ink">{monthsLabel(pending.months)}</strong>, dès maintenant, jusqu’à environ le <strong className="text-ink">{formatDate(estimatedEnd.toISOString())}</strong>.
          </p>
          <p>{commissionNote}</p>
          {reason.trim() && <p className="break-words">Motif : {reason.trim()}</p>}
        </ConfirmModal>
      )}

      {pending?.kind === 'extend' && estimatedEnd && active && (
        <ConfirmModal
          title={`Prolonger de ${monthsLabel(pending.months)}`}
          confirmLabel="Prolonger"
          busy={busy}
          error={actionError}
          onCancel={closeModal}
          onConfirm={() => void confirm()}
        >
          <p>
            L’accès {PLUS_PLAN_NAME} offert à <strong className="text-ink">{shopName}</strong>, actuellement valable jusqu’au {formatDate(active.endsAt)}, sera prolongé de <strong className="text-ink">{monthsLabel(pending.months)}</strong>, soit jusqu’à environ le <strong className="text-ink">{formatDate(estimatedEnd.toISOString())}</strong>.
          </p>
          <p>{commissionNote}</p>
          <ReasonField id="extend-reason" value={modalReason} onChange={setModalReason} />
        </ConfirmModal>
      )}

      {pending?.kind === 'end' && active && (
        <ConfirmModal
          title="Mettre fin à l’accès offert"
          confirmLabel="Mettre fin à l’accès"
          busy={busy}
          error={actionError}
          onCancel={closeModal}
          onConfirm={() => void confirm()}
        >
          <p className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-3 text-orange-700">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>L’accès {PLUS_PLAN_NAME} offert à <strong>{shopName}</strong> prendra fin immédiatement, avant le {formatDate(active.endsAt)}.</span>
          </p>
          <p>
            La boutique repassera à Free (commission de {FREE_COMMISSION_PERCENT} %). Jusqu’à {FREE_PRODUCT_LIMIT} produits restent publiés, les autres sont dépubliés. Aucun produit n’est supprimé.
          </p>
          <ReasonField id="end-reason" value={modalReason} onChange={setModalReason} />
        </ConfirmModal>
      )}
    </section>
  );
}
