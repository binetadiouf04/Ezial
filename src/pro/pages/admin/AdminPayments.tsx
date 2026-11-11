import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import {
  fetchPaymentSettings, fetchProviderStatus, fetchPendingPayoutMethods, reviewPayoutMethod,
  fetchPaymentTransactions, fetchSellerPayouts, fetchAmountsDueToSellers, fetchCommissionTotals,
  fetchAnomalies, fetchAuditLog, fetchShopOptions, fetchPickupsToConfirm, confirmPickup, providerLabel, formatWalletPhone,
  PAYMENT_STATUS_LABELS, PAYOUT_STATUS_LABELS,
  type PaymentSettings, type ProviderStatus, type PendingPayoutMethod, type PaymentTransaction,
  type AdminSellerPayout, type AmountDueToShop, type FinanceAnomaly, type AuditLogEntry, type ShopOption, type PickupToConfirm,
  type PaymentProvider, type PaymentCapability, type PaymentTransactionStatus, type PaymentFilters,
} from '@/lib/supabasePayments';
import { PayoutStatusBadge } from '../seller/SellerPaymentsSection';
import { Loader2, AlertCircle, Landmark, RefreshCw, CheckCircle2, CircleOff, Check, X } from 'lucide-react';

// Paiements et décaissements — supervision en lecture seule. Les statuts
// affichés sont ceux écrits par les services serveur après vérification
// auprès de Wave / Orange Money : aucun bouton ne permet de marquer un
// paiement ou un versement comme effectué. Seule action : valider ou refuser
// le numéro de réception d'un vendeur.

/** Une API n'est dite opérationnelle que si sa dernière vérification date de moins de 30 minutes. */
const RECENT_CHECK_MS = 30 * 60 * 1000;

const WEEKDAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const capabilityLabels: Record<PaymentCapability, string> = {
  collection: 'encaissement',
  disbursement: 'décaissement',
};

const actorLabels: Record<string, string> = {
  system: 'Système',
  service: 'Service de paiement',
  admin: 'Administrateur',
  seller: 'Vendeur',
  customer: 'Client',
  driver: 'Livreur',
};

const actionLabels: Record<string, string> = {
  sale_cancelled: 'Vente annulée',
  sale_available: 'Vente disponible au versement',
  sale_on_hold: 'Vente mise en attente',
  delivery_confirmed: 'Livraison confirmée',
  payment_initiated: 'Paiement initié',
  payment_amount_mismatch: 'Montant de paiement incohérent',
  payment_confirmed: 'Paiement confirmé',
  payment_failed: 'Paiement échoué',
  payment_cancelled: 'Paiement annulé',
  payment_expired: 'Paiement expiré',
  payout_method_submitted: 'Numéro de réception envoyé',
  payout_method_approved: 'Numéro de réception validé',
  payout_method_rejected: 'Numéro de réception refusé',
  admin_confirm_pickup: 'Retrait en boutique confirmé',
  payout_scheduled: 'Versement programmé',
  payout_succeeded: 'Versement effectué',
  payout_failed: 'Versement échoué',
  payout_unknown: 'Versement à vérifier',
  payout_blocked: 'Versement en attente de fonds',
};

const entityLabels: Record<string, string> = {
  seller_transaction: 'Vente vendeur',
  delivery_mission: 'Mission de livraison',
  payment_transaction: 'Paiement',
  seller_payout_method: 'Numéro de réception',
  order_shop: 'Commande boutique',
  seller_payout: 'Versement',
};

const paymentStatusStyles: Record<PaymentTransactionStatus, string> = {
  initiated: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  failed: 'bg-burgundy/10 text-burgundy',
  cancelled: 'bg-ink/5 text-ink/50',
  expired: 'bg-ink/5 text-ink/45',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '';
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type BaseState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | {
    kind: 'ready';
    settings: PaymentSettings | null;
    statuses: ProviderStatus[];
    pendingMethods: PendingPayoutMethod[];
    pickups: PickupToConfirm[];
    due: { total: number; shops: AmountDueToShop[] } | null;
    commissions: { recorded: number; onConfirmedPayments: number } | null;
    anomalies: FinanceAnomaly[];
    audit: AuditLogEntry[];
    checkedAt: number;
    error: string;
  };

export default function AdminPayments() {
  const [state, setState] = useState<BaseState>({ kind: 'loading' });
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [settingsRes, statusRes, methodsRes, pickupsRes, dueRes, commissionsRes, anomaliesRes, auditRes] = await Promise.all([
      fetchPaymentSettings(),
      fetchProviderStatus(),
      fetchPendingPayoutMethods(),
      fetchPickupsToConfirm(),
      fetchAmountsDueToSellers(),
      fetchCommissionTotals(),
      fetchAnomalies(),
      fetchAuditLog(100),
    ]);
    setRefreshing(false);
    const all = [settingsRes, statusRes, methodsRes, pickupsRes, dueRes, commissionsRes, anomaliesRes, auditRes];
    if (all.some((r) => !r.supported)) {
      setState({ kind: 'missing' });
      return;
    }
    setState({
      kind: 'ready',
      settings: 'settings' in settingsRes ? settingsRes.settings : null,
      statuses: 'statuses' in statusRes ? statusRes.statuses : [],
      pendingMethods: 'methods' in methodsRes ? methodsRes.methods : [],
      pickups: 'pickups' in pickupsRes ? pickupsRes.pickups : [],
      due: 'total' in dueRes ? { total: dueRes.total, shops: dueRes.shops } : null,
      commissions: 'recorded' in commissionsRes ? { recorded: commissionsRes.recorded, onConfirmedPayments: commissionsRes.onConfirmedPayments } : null,
      anomalies: 'anomalies' in anomaliesRes ? anomaliesRes.anomalies : [],
      audit: 'entries' in auditRes ? auditRes.entries : [],
      checkedAt: Date.now(),
      error: all.map((r) => ('error' in r ? r.error : '')).filter(Boolean).join(' '),
    });
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetchShopOptions().then(setShops); }, []);

  const refresh = () => { setReloadKey((k) => k + 1); void load(); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Paiements et décaissements</h1>
          <p className="mt-1 text-sm text-ink/55">Encaissements Wave et Orange Money, numéros de réception des vendeurs et versements. Les statuts viennent uniquement des fournisseurs.</p>
        </div>
        {state.kind === 'ready' && (
          <button onClick={refresh} disabled={refreshing} className="btn-outline flex items-center gap-1.5">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Actualiser
          </button>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      )}

      {state.kind === 'missing' && (
        <div className="card p-8 text-center">
          <Landmark size={28} strokeWidth={1.6} className="mx-auto text-ink/20" />
          <p className="mt-3 text-sm font-medium text-ink/70">Module paiements pas encore installé (migration SQL à exécuter).</p>
          <p className="mt-1 text-xs text-ink/45">Aucun encaissement ni versement automatique n'a lieu tant que la migration n'a pas été exécutée.</p>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          {state.error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {state.error}
            </p>
          )}
          <ApiStatusSection settings={state.settings} statuses={state.statuses} checkedAt={state.checkedAt} />
          <PendingMethodsSection methods={state.pendingMethods} onReviewed={load} />
          <PickupsSection pickups={state.pickups} onConfirmed={load} />
          <TransactionsSection shops={shops} reloadKey={reloadKey} />
          <PayoutsSection shops={shops} due={state.due} reloadKey={reloadKey} />
          <CommissionsSection commissions={state.commissions} />
          <AnomaliesSection anomalies={state.anomalies} />
          <AuditSection entries={state.audit} />
        </>
      )}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-semibold text-ink">{children}</h2>
      {hint && <p className="mt-0.5 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// État des API
// ---------------------------------------------------------------------

function ApiStatusSection({ settings, statuses, checkedAt }: { settings: PaymentSettings | null; statuses: ProviderStatus[]; checkedAt: number }) {
  const lines: { provider: PaymentProvider; capability: PaymentCapability }[] = [
    { provider: 'wave', capability: 'collection' },
    { provider: 'wave', capability: 'disbursement' },
    { provider: 'orange_money', capability: 'collection' },
    { provider: 'orange_money', capability: 'disbursement' },
  ];
  const frequency = settings?.payoutFrequency === 'weekly'
    ? `hebdomadaire, le ${WEEKDAYS[settings.payoutWeekday] ?? 'lundi'}`
    : 'quotidien';

  return (
    <section>
      <SectionTitle>État des API</SectionTitle>
      <div className="card space-y-4 p-5">
        <ul className="divide-y divide-line">
          {lines.map(({ provider, capability }) => {
            const s = statuses.find((x) => x.provider === provider && x.capability === capability);
            const checkedMs = s?.lastCheckedAt ? new Date(s.lastCheckedAt).getTime() : NaN;
            const operational = Boolean(s?.configured && s.ready) && !Number.isNaN(checkedMs) && checkedAt - checkedMs < RECENT_CHECK_MS;
            return (
              <li key={`${provider}-${capability}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{providerLabel(provider)} — {capabilityLabels[capability]}</p>
                  <p className="text-xs text-ink/45">
                    Dernière vérification : {s?.lastCheckedAt ? formatDateTime(s.lastCheckedAt) : 'jamais'}
                    {s && s.lastBalance !== null && <> · Solde : {formatFCFA(s.lastBalance)}</>}
                  </p>
                  {!operational && s?.lastError && <p className="text-xs text-burgundy">Dernière erreur : {s.lastError}</p>}
                </div>
                {operational ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700"><CheckCircle2 size={14} /> Opérationnelle</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><CircleOff size={14} /> Non configurée</span>
                )}
              </li>
            );
          })}
        </ul>
        <dl className="grid grid-cols-1 gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-ink/55">Encaissements : </dt>
            <dd className="inline font-medium text-ink">{settings?.collectionsEnabled ? 'activés' : 'désactivés'}</dd>
          </div>
          <div>
            <dt className="inline text-ink/55">Versements : </dt>
            <dd className="inline font-medium text-ink">{settings?.payoutsEnabled ? `activés (${frequency})` : 'désactivés'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Moyens de réception à valider
// ---------------------------------------------------------------------

function PendingMethodsSection({ methods, onReviewed }: { methods: PendingPayoutMethod[]; onReviewed: () => Promise<void> }) {
  return (
    <section>
      <SectionTitle hint="Vérifiez que le numéro appartient bien à la boutique avant de valider. Les versements vers ce numéro n'ont lieu qu'après validation.">
        Moyens de réception à valider
      </SectionTitle>
      {methods.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucun numéro en attente de validation.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {methods.map((m) => <PendingMethodCard key={m.id} method={m} onReviewed={onReviewed} />)}
        </div>
      )}
    </section>
  );
}

function PendingMethodCard({ method, onReviewed }: { method: PendingPayoutMethod; onReviewed: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    setError('');
    const result = await reviewPayoutMethod(method.id, approve, note);
    setBusy(null);
    if (!result.supported) { setError('Module paiements pas encore installé.'); return; }
    if ('error' in result) { setError(result.error); return; }
    await onReviewed();
  };

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{method.shopName ?? 'Boutique'}</p>
          <p className="text-xs text-ink/45">Envoyé le {formatDateTime(method.submittedAt)}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-burgundy">{providerLabel(method.provider)}</span>
      </div>
      <div className="space-y-0.5 text-sm">
        <p className="font-mono text-ink">{formatWalletPhone(method.phone)}</p>
        <p className="text-xs text-ink/55">Titulaire : {method.holderName ?? 'non renseigné'}</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink/55">Motif (facultatif, transmis au vendeur)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="input-field" />
      </label>
      {error && <p className="text-sm text-burgundy">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void decide(true)} disabled={busy !== null} className="btn-primary px-5 py-2.5">
          {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Valider
        </button>
        <button onClick={() => void decide(false)} disabled={busy !== null} className="btn-danger px-5 py-2.5">
          {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Refuser
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Retraits en boutique à confirmer
// ---------------------------------------------------------------------

function PickupsSection({ pickups, onConfirmed }: { pickups: PickupToConfirm[]; onConfirmed: () => Promise<void> }) {
  const { navigate } = usePro();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const confirm = async (p: PickupToConfirm) => {
    const ok = window.confirm(
      `Confirmer le retrait de la commande ${p.orderNumber ?? ''} par le client chez ${p.shopName ?? 'la boutique'} ?\n\n`
      + `La part du vendeur (${formatFCFA(p.netAmount)}) deviendra versable si aucune réclamation n'est ouverte. Ne confirmez que si le retrait a bien eu lieu.`,
    );
    if (!ok) return;
    setBusyId(p.orderShopId);
    setError('');
    const result = await confirmPickup(p.orderShopId);
    setBusyId(null);
    if (!result.supported) { setError('Module paiements pas encore installé.'); return; }
    if ('error' in result) { setError(result.error); return; }
    await onConfirmed();
  };

  return (
    <section>
      <SectionTitle hint="Retraits déclarés par la boutique sur des commandes payées. La vente du vendeur ne devient versable qu'après votre confirmation.">
        Retraits en boutique à confirmer
      </SectionTitle>
      {error && <p className="mb-2 text-sm text-burgundy">{error}</p>}
      {pickups.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucun retrait à confirmer.</div>
      ) : (
        <div className="card divide-y divide-line">
          {pickups.map((p) => (
            <div key={p.orderShopId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold text-ink">{p.shopName ?? shortId(p.shopId)}</p>
                <p className="mt-0.5 text-xs text-ink/50">
                  Commande{' '}
                  <button onClick={() => navigate(`/admin/commandes/${p.orderId}`)} className="font-mono font-semibold text-burgundy hover:underline">
                    {p.orderNumber ?? 'voir le détail'}
                  </button>
                  {' '}· {formatDateTime(p.orderDate)} · Net vendeur : <span className="font-medium text-ink">{formatFCFA(p.netAmount)}</span>
                </p>
              </div>
              <button onClick={() => void confirm(p)} disabled={busyId !== null} className="btn-primary flex-shrink-0 px-5 py-2.5">
                {busyId === p.orderShopId ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmer le retrait
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Filtres partagés (encaissements / décaissements)
// ---------------------------------------------------------------------

interface FilterValues {
  provider: '' | PaymentProvider;
  status: string;
  from: string;
  to: string;
  shopText: string;
}

const emptyFilters: FilterValues = { provider: '', status: '', from: '', to: '', shopText: '' };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Filtres prêts pour la requête ; la recherche libre « boutique » devient une liste d'identifiants. */
function useQueryFilters(values: FilterValues, shops: ShopOption[]): PaymentFilters {
  const shopText = useDebounced(values.shopText, 400);
  const filters: PaymentFilters = {};
  if (values.provider) filters.provider = values.provider;
  if (values.status) filters.status = values.status;
  if (values.from) filters.from = values.from;
  if (values.to) filters.to = values.to;
  const q = normalize(shopText);
  if (q) filters.shopId = shops.filter((s) => normalize(s.name).includes(q)).map((s) => s.id);
  // Même objet tant que la requête ne change pas : évite de recharger à chaque rendu.
  const key = JSON.stringify(filters);
  return useMemo(() => JSON.parse(key) as PaymentFilters, [key]);
}

function FiltersBar({
  values, onChange, statusOptions, idPrefix,
}: { values: FilterValues; onChange: (v: FilterValues) => void; statusOptions: Record<string, string>; idPrefix: string }) {
  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => onChange({ ...values, [key]: value });
  const selectCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink sm:text-sm focus:border-burgundy focus:outline-none';
  return (
    <div className="card mb-3 grid grid-cols-2 gap-2 p-3 lg:grid-cols-5">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-ink/50">Fournisseur</span>
        <select id={`${idPrefix}-provider`} value={values.provider} onChange={(e) => set('provider', e.target.value as FilterValues['provider'])} className={selectCls}>
          <option value="">Tous</option>
          <option value="wave">Wave</option>
          <option value="orange_money">Orange Money</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-ink/50">Statut</span>
        <select id={`${idPrefix}-status`} value={values.status} onChange={(e) => set('status', e.target.value)} className={selectCls}>
          <option value="">Tous</option>
          {Object.entries(statusOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-ink/50">Du</span>
        <input type="date" value={values.from} onChange={(e) => set('from', e.target.value)} className={selectCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-ink/50">Au</span>
        <input type="date" value={values.to} onChange={(e) => set('to', e.target.value)} className={selectCls} />
      </label>
      <label className="col-span-2 block lg:col-span-1">
        <span className="mb-1 block text-[11px] font-medium text-ink/50">Boutique</span>
        <input type="search" value={values.shopText} onChange={(e) => set('shopText', e.target.value)} placeholder="Nom de la boutique" className={selectCls} />
      </label>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: PaymentTransactionStatus }) {
  return (
    <span className={`inline-block flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${paymentStatusStyles[status] ?? 'bg-ink/5 text-ink/55'}`}>
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------
// Encaissements
// ---------------------------------------------------------------------

function TransactionsSection({ shops, reloadKey }: { shops: ShopOption[]; reloadKey: number }) {
  const { navigate } = usePro();
  const [values, setValues] = useState<FilterValues>(emptyFilters);
  const filters = useQueryFilters(values, shops);
  const [rows, setRows] = useState<PaymentTransaction[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void fetchPaymentTransactions(filters).then((res) => {
      if (cancelled) return;
      if (!res.supported) { setError('Module paiements pas encore installé.'); setRows([]); return; }
      if ('error' in res) { setError(res.error); setRows([]); return; }
      setError('');
      setRows(res.transactions);
    });
    return () => { cancelled = true; };
  }, [filters, reloadKey]);

  return (
    <section>
      <SectionTitle hint="Paiements des acheteurs, un par commande. « Confirmé » uniquement après vérification auprès du fournisseur.">Encaissements</SectionTitle>
      <FiltersBar values={values} onChange={setValues} statusOptions={PAYMENT_STATUS_LABELS} idPrefix="tx" />
      {error && <p className="mb-2 text-sm text-burgundy">{error}</p>}
      {rows === null ? (
        <div className="card p-6 text-center"><Loader2 size={18} className="mx-auto animate-spin text-ink/30" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucun encaissement.</div>
      ) : (
        <>
          {rows.length >= 200 && <p className="mb-2 text-xs text-ink/45">Affichage des 200 encaissements les plus récents.</p>}
          <div className="space-y-3 lg:hidden">
            {rows.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{formatFCFA(t.amount)}</p>
                    <p className="mt-0.5 text-xs text-ink/45">{formatDateTime(t.createdAt)} · {providerLabel(t.provider)}</p>
                  </div>
                  <PaymentStatusBadge status={t.status} />
                </div>
                {t.failureReason && <p className="mt-2 text-xs text-ink/55">Motif : {t.failureReason}</p>}
                <button onClick={() => navigate(`/admin/commandes/${t.orderId}`)} className="mt-3 w-full rounded-lg bg-cream/60 px-3 py-2 text-left text-xs font-medium text-ink/70 hover:bg-cream">
                  Commande <span className="font-mono font-semibold text-ink">{t.orderNumber ?? 'voir le détail'}</span>
                </button>
              </div>
            ))}
          </div>
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-medium uppercase tracking-wider text-ink/40">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Commande n°</th>
                  <th className="px-4 py-3 font-medium">Fournisseur</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/60">{formatDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/admin/commandes/${t.orderId}`)} className="font-mono text-xs font-semibold text-burgundy hover:underline">
                        {t.orderNumber ?? 'Voir'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink">{providerLabel(t.provider)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink">{formatFCFA(t.amount)}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={t.status} /></td>
                    <td className="max-w-xs px-4 py-3 text-xs text-ink/55">{t.failureReason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Décaissements
// ---------------------------------------------------------------------

function PayoutsSection({ shops, due, reloadKey }: { shops: ShopOption[]; due: { total: number; shops: AmountDueToShop[] } | null; reloadKey: number }) {
  const [values, setValues] = useState<FilterValues>(emptyFilters);
  const filters = useQueryFilters(values, shops);
  const [rows, setRows] = useState<AdminSellerPayout[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void fetchSellerPayouts(filters).then((res) => {
      if (cancelled) return;
      if (!res.supported) { setError('Module paiements pas encore installé.'); setRows([]); return; }
      if ('error' in res) { setError(res.error); setRows([]); return; }
      setError('');
      setRows(res.payouts);
    });
    return () => { cancelled = true; };
  }, [filters, reloadKey]);

  const reasonOf = (p: AdminSellerPayout) => p.blockReason ?? p.lastError ?? '';

  return (
    <section>
      <SectionTitle hint="Versements aux vendeurs. « Versé » uniquement après confirmation du fournisseur ; un versement « Vérification en cours » n'est jamais renvoyé automatiquement.">
        Décaissements
      </SectionTitle>

      {due && (
        <div className="card mb-3 p-4">
          <p className="text-xs font-medium text-ink/50">Montants dus aux vendeurs (disponibles, pas encore dans un versement)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-burgundy">{formatFCFA(due.total)}</p>
          {due.shops.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
              {due.shops.map((s) => (
                <li key={s.shopId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-ink/75">{s.shopName ?? shortId(s.shopId)}</span>
                  <span className="flex-shrink-0 font-medium text-ink">{formatFCFA(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <FiltersBar values={values} onChange={setValues} statusOptions={PAYOUT_STATUS_LABELS} idPrefix="po" />
      {error && <p className="mb-2 text-sm text-burgundy">{error}</p>}
      {rows === null ? (
        <div className="card p-6 text-center"><Loader2 size={18} className="mx-auto animate-spin text-ink/30" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucun versement.</div>
      ) : (
        <>
          {rows.length >= 200 && <p className="mb-2 text-xs text-ink/45">Affichage des 200 versements les plus récents.</p>}
          <div className="space-y-3 lg:hidden">
            {rows.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{p.shopName ?? shortId(p.shopId)}</p>
                    <p className="mt-0.5 text-xs text-ink/45">{formatDateTime(p.createdAt)} · {providerLabel(p.provider)}</p>
                  </div>
                  <PayoutStatusBadge status={p.status} />
                </div>
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink/60">
                  <p>Montant : <span className="font-semibold text-ink">{formatFCFA(p.amount)}</span></p>
                  <p>Numéro : <span className="font-mono text-ink/75">{formatWalletPhone(p.recipientPhone)}</span></p>
                  <p>Tentatives : {p.attempts}</p>
                  {reasonOf(p) && <p className="break-words text-burgundy">{reasonOf(p)}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-medium uppercase tracking-wider text-ink/40">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Boutique</th>
                  <th className="px-4 py-3 font-medium">Fournisseur</th>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-center">Tentatives</th>
                  <th className="px-4 py-3 font-medium">Motif / erreur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/60">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 text-ink">{p.shopName ?? shortId(p.shopId)}</td>
                    <td className="px-4 py-3 text-ink">{providerLabel(p.provider)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/70">{formatWalletPhone(p.recipientPhone)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink">{formatFCFA(p.amount)}</td>
                    <td className="px-4 py-3"><PayoutStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-center text-ink/70">{p.attempts}</td>
                    <td className="max-w-xs break-words px-4 py-3 text-xs text-burgundy">{reasonOf(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Commissions, anomalies, journal d'audit
// ---------------------------------------------------------------------

function CommissionsSection({ commissions }: { commissions: { recorded: number; onConfirmedPayments: number } | null }) {
  if (!commissions) return null;
  return (
    <section>
      <SectionTitle hint="Commissions calculées à la création de chaque commande, hors commandes boutique annulées.">Commissions Ezial</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-medium text-ink/50">Total des commissions enregistrées</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-ink">{formatFCFA(commissions.recorded)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-ink/50">Dont sur paiements confirmés par le fournisseur</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-burgundy">{formatFCFA(commissions.onConfirmedPayments)}</p>
        </div>
      </div>
    </section>
  );
}

function AnomaliesSection({ anomalies }: { anomalies: FinanceAnomaly[] }) {
  return (
    <section>
      <SectionTitle hint="Écarts détectés automatiquement (montant différent, double paiement, annulation après versement…). À traiter avec le fournisseur.">Anomalies</SectionTitle>
      {anomalies.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucune anomalie détectée.</div>
      ) : (
        <div className="card divide-y divide-line">
          {anomalies.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-4">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-burgundy" />
              <div className="min-w-0 text-sm">
                <p className="text-ink">{a.reason ?? 'Anomalie sans détail.'}</p>
                <p className="mt-0.5 text-xs text-ink/45">{formatDateTime(a.createdAt)} · réf. <span className="font-mono">{shortId(a.entityId)}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditSection({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <section>
      <SectionTitle hint="Les 100 dernières opérations financières enregistrées par le serveur.">Journal d’audit</SectionTitle>
      {entries.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink/45">Aucune opération enregistrée.</div>
      ) : (
        <>
          <div className="card divide-y divide-line lg:hidden">
            {entries.map((e) => (
              <div key={e.id} className="p-4 text-sm">
                <p className="font-medium text-ink">{actionLabels[e.action] ?? e.action}</p>
                <p className="mt-0.5 text-xs text-ink/50">
                  {formatDateTime(e.occurredAt)} · {actorLabels[e.actorKind] ?? e.actorKind} · {entityLabels[e.entity] ?? e.entity}
                  {e.entityId && <> <span className="font-mono">{shortId(e.entityId)}</span></>}
                </p>
              </div>
            ))}
          </div>
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-medium uppercase tracking-wider text-ink/40">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Acteur</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/60">{formatDateTime(e.occurredAt)}</td>
                    <td className="px-4 py-3 text-ink/75">{actorLabels[e.actorKind] ?? e.actorKind}</td>
                    <td className="px-4 py-3 text-ink">{actionLabels[e.action] ?? e.action}</td>
                    <td className="px-4 py-3 text-ink/75">
                      {entityLabels[e.entity] ?? e.entity}
                      {e.entityId && <span className="ml-1.5 font-mono text-xs text-ink/45">{shortId(e.entityId)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
