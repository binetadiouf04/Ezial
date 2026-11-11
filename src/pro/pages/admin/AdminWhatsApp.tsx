import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import {
  fetchWhatsAppSettings, fetchWhatsAppNotifications, fetchWhatsAppCounts,
  type WhatsAppSettings, type WhatsAppNotification, type WhatsAppCounts,
  type WhatsAppKind, type WhatsAppStatus, type WhatsAppStatusFilter,
} from '@/lib/supabaseWhatsApp';
import { Loader2, AlertCircle, MessageCircle, RefreshCw, ChevronRight, CheckCircle2, CircleOff } from 'lucide-react';

// Supervision des notifications WhatsApp automatiques. Lecture seule : l'état
// affiché est celui écrit par le service d'envoi (jamais supposé). La
// connexion n'est dite « Connectée » que si le fournisseur est prêt ET qu'un
// passage du service a eu lieu il y a moins de 10 minutes.

const RECENT_DISPATCH_MS = 10 * 60 * 1000;

const kindLabels: Record<WhatsAppKind, string> = {
  buyer_order_confirmed: 'Confirmation acheteur',
  buyer_out_for_delivery: 'Livraison en cours',
  seller_new_order: 'Nouvelle commande vendeur',
  seller_order_reminder: 'Rappel vendeur 24 h',
};

const statusLabels: Record<WhatsAppStatus, string> = {
  pending: 'En attente',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  failed: 'Échouée',
  skipped: 'Ignorée',
  expired: 'Expirée',
};

const statusStyles: Record<WhatsAppStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-burgundy/10 text-burgundy',
  skipped: 'bg-ink/5 text-ink/55',
  expired: 'bg-ink/5 text-ink/45',
};

const filterLabels: Record<WhatsAppStatusFilter, string> = {
  pending: 'En attente',
  sent: 'Envoyées',
  failed: 'Échouées',
  skipped: 'Ignorées',
  expired: 'Expirées',
};
const filters: WhatsAppStatusFilter[] = ['pending', 'sent', 'failed', 'skipped', 'expired'];

const skipReasonLabels: Record<string, string> = {
  no_consent: 'Pas de consentement WhatsApp',
  invalid_phone: 'Numéro invalide ou absent',
  consent_withdrawn: 'Consentement retiré',
  order_cancelled: 'Commande annulée',
  already_handled: 'Déjà prise en charge',
  not_out_for_delivery: 'Plus en cours de livraison',
  order_shop_cancelled: 'Commande vendeur annulée',
  payment_not_confirmed: 'Paiement non confirmé',
};

function skipReasonLabel(reason: string): string {
  return skipReasonLabels[reason] ?? reason;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; settings: WhatsAppSettings | null; counts: WhatsAppCounts | null; notifications: WhatsAppNotification[]; checkedAt: number; error: string };

export default function AdminWhatsApp() {
  const { navigate } = usePro();
  const [filter, setFilter] = useState<WhatsAppStatusFilter | 'all'>('all');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (currentFilter: WhatsAppStatusFilter | 'all') => {
    setRefreshing(true);
    const [settingsRes, countsRes, listRes] = await Promise.all([
      fetchWhatsAppSettings(),
      fetchWhatsAppCounts(),
      fetchWhatsAppNotifications({ status: currentFilter === 'all' ? undefined : currentFilter }),
    ]);
    setRefreshing(false);
    if (!settingsRes.supported || !countsRes.supported || !listRes.supported) {
      setState({ kind: 'missing' });
      return;
    }
    const errors = [settingsRes, countsRes, listRes].map((r) => ('error' in r ? r.error : '')).filter(Boolean);
    setState({
      kind: 'ready',
      settings: 'settings' in settingsRes ? settingsRes.settings : null,
      counts: 'counts' in countsRes ? countsRes.counts : null,
      notifications: 'notifications' in listRes ? listRes.notifications : [],
      checkedAt: Date.now(),
      error: errors.join(' '),
    });
  }, []);

  useEffect(() => { void load(filter); }, [load, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Notifications WhatsApp</h1>
          <p className="text-sm text-ink/55 mt-1">Confirmations acheteur, livraisons en cours, nouvelles commandes et rappels vendeur. Envoyées uniquement aux comptes ayant donné leur accord.</p>
        </div>
        {state.kind === 'ready' && (
          <button onClick={() => void load(filter)} disabled={refreshing} className="btn-outline flex items-center gap-1.5">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Actualiser
          </button>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      )}

      {state.kind === 'missing' && (
        <div className="card p-8 text-center">
          <MessageCircle size={28} className="mx-auto text-ink/20" />
          <p className="mt-3 text-sm font-medium text-ink/70">Module WhatsApp pas encore installé (migration SQL à exécuter).</p>
          <p className="mt-1 text-xs text-ink/45">Aucune notification WhatsApp n'est créée ni envoyée tant que la migration n'a pas été exécutée.</p>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <ConnectionCard settings={state.settings} checkedAt={state.checkedAt} />

          {state.error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {state.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Toutes" />
            {filters.map((f) => (
              <FilterChip
                key={f}
                active={filter === f}
                onClick={() => setFilter(f)}
                label={filterLabels[f]}
                count={state.counts ? state.counts[f] : undefined}
              />
            ))}
          </div>

          {state.notifications.length === 0 ? (
            <div className="card p-8 text-center">
              <MessageCircle size={28} className="mx-auto text-ink/20" />
              <p className="mt-3 text-sm text-ink/45">{filter === 'all' ? 'Aucune notification WhatsApp pour le moment.' : 'Aucune notification avec ce statut.'}</p>
            </div>
          ) : (
            <>
              {state.notifications.length >= 100 && <p className="text-xs text-ink/45">Affichage des 100 notifications les plus récentes.</p>}

              {/* Téléphone et tablette : cartes */}
              <div className="space-y-3 lg:hidden">
                {state.notifications.map((n) => (
                  <div key={n.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{kindLabels[n.kind] ?? n.kind}</p>
                        <p className="mt-0.5 text-xs text-ink/45">{formatDateTime(n.createdAt)}</p>
                      </div>
                      <StatusBadge status={n.status} />
                    </div>
                    <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink/60">
                      <p>Destinataire : <span className="font-mono text-ink/75">{n.recipientMasked ?? 'Numéro absent'}</span></p>
                      <p>Tentatives : {n.attempts}</p>
                      {n.status === 'sent' && n.sentAt && <p>Envoyée le {formatDateTime(n.sentAt)}</p>}
                      <ReasonLines n={n} />
                    </div>
                    <button onClick={() => navigate(`/admin/commandes/${n.orderId}`)} className="mt-3 flex w-full items-center justify-between rounded-lg bg-cream/60 px-3 py-2 text-left text-xs font-medium text-ink/70 hover:bg-cream transition-colors">
                      <span>Commande <span className="font-mono font-semibold text-ink">{n.orderNumber ?? 'voir le détail'}</span></span>
                      <ChevronRight size={14} className="text-ink/30" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Ordinateur : tableau */}
              <div className="card hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs font-medium uppercase tracking-wider text-ink/40">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Commande</th>
                      <th className="px-4 py-3 font-medium">Destinataire</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium text-center">Tentatives</th>
                      <th className="px-4 py-3 font-medium">Raison / erreur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {state.notifications.map((n) => (
                      <tr key={n.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/60">{formatDateTime(n.createdAt)}</td>
                        <td className="px-4 py-3 text-ink">{kindLabels[n.kind] ?? n.kind}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/admin/commandes/${n.orderId}`)} className="font-mono text-xs font-semibold text-burgundy hover:underline">
                            {n.orderNumber ?? 'Voir'}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/70">{n.recipientMasked ?? '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                        <td className="px-4 py-3 text-center text-ink/70">{n.attempts}</td>
                        <td className="max-w-xs px-4 py-3 text-xs text-ink/60"><ReasonLines n={n} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ConnectionCard({ settings, checkedAt }: { settings: WhatsAppSettings | null; checkedAt: number }) {
  const lastDispatchMs = settings?.lastDispatchAt ? new Date(settings.lastDispatchAt).getTime() : NaN;
  const recentDispatch = !Number.isNaN(lastDispatchMs) && checkedAt - lastDispatchMs < RECENT_DISPATCH_MS;
  const connected = Boolean(settings?.providerReady) && recentDispatch;

  return (
    <div className="card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-ink">État de la connexion API</h2>
      {connected ? (
        <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700">
          <CheckCircle2 size={16} className="flex-shrink-0" /> Connectée{settings?.provider ? ` (fournisseur ${settings.provider})` : ''}
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700">
          <CircleOff size={16} className="flex-shrink-0" /> Non connectée — aucun message n'est envoyé
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs text-ink/60 sm:grid-cols-2">
        <div><dt className="inline">Fournisseur : </dt><dd className="inline text-ink/80">{settings?.provider || 'aucun'}</dd></div>
        <div><dt className="inline">Dernier passage du service d'envoi : </dt><dd className="inline text-ink/80">{settings?.lastDispatchAt ? formatDateTime(settings.lastDispatchAt) : 'jamais'}</dd></div>
        <div className="sm:col-span-2">
          <dt className="inline">Confirmation acheteur : </dt>
          <dd className="inline text-ink/80">{settings?.confirmationRequiresPaid ? 'après paiement validé' : 'à la création de la commande'}</dd>
        </div>
      </dl>
      {!connected && settings?.lastDispatchError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-xs text-burgundy">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Dernière erreur du service d'envoi : {settings.lastDispatchError}
        </p>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}
    >
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );
}

function StatusBadge({ status }: { status: WhatsAppStatus }) {
  return (
    <span className={`inline-block flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[status] ?? 'bg-ink/5 text-ink/55'}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

function ReasonLines({ n }: { n: WhatsAppNotification }) {
  if (!n.skipReason && !n.lastError) return n.status === 'sent' ? null : <span className="text-ink/30">—</span>;
  return (
    <>
      {n.skipReason && <p>Raison : {skipReasonLabel(n.skipReason)}</p>}
      {n.lastError && <p className="break-words text-burgundy">Erreur technique : {n.lastError}</p>}
    </>
  );
}
