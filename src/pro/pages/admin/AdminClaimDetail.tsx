import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminClaimDetail, fetchClaimEvents, adminUpdateClaimStatus, type AdminClaim, type ClaimEvent } from '@/lib/supabaseAdminClaims';
import type { ClaimStatus } from '@/lib/supabaseClaims';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Loader2, AlertCircle, ImageOff } from 'lucide-react';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const solutionLabels: Record<string, string> = { remboursement: 'Remboursement', echange: 'Échange', autre: 'Autre' };
const eventRoleLabels: Record<string, string> = { customer: 'Client', seller: 'Vendeur', admin: 'Admin' };

// Centralized admin claims/refunds workspace. Every status change goes
// through admin_update_claim_status() — never a direct table update — so
// this page is a thin UI over that one function, and the event trail below
// is always a complete, server-written record of who decided what and
// when, not something this page assembles itself.
export default function AdminClaimDetail({ claimId }: { claimId: string }) {
  const { navigate } = usePro();
  const [claim, setClaim] = useState<AdminClaim | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [note, setNote] = useState('');
  const [refusalReason, setRefusalReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [c, e] = await Promise.all([fetchAdminClaimDetail(claimId), fetchClaimEvents(claimId)]);
      if (!c) { setLoadError('Réclamation introuvable.'); return; }
      setClaim(c);
      setEvents(e);
    } catch {
      setLoadError('Impossible de charger cette réclamation. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => { void load(); }, [load]);

  const applyStatus = async (newStatus: ClaimStatus) => {
    if (!claim) return;
    if (newStatus === 'refusee' && !refusalReason.trim()) { setActionError('Le motif de refus est obligatoire.'); return; }
    if (newStatus === 'remboursee' && !refundAmount.trim()) { setActionError('Le montant remboursé est obligatoire — jamais simulé, uniquement après un virement réellement effectué.'); return; }
    setActionError('');
    setActing(true);
    const result = await adminUpdateClaimStatus(
      claim.id, newStatus, note,
      newStatus === 'refusee' ? refusalReason : undefined,
      newStatus === 'remboursee' ? Number(refundAmount) : undefined,
    );
    setActing(false);
    if (result.error) { setActionError(result.error); return; }
    setNote(''); setRefusalReason(''); setRefundAmount('');
    void load();
  };

  if (loading) return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  if (loadError || !claim) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/admin/reclamations')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink"><ArrowLeft size={15} /> Réclamations</button>
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}</p>
      </div>
    );
  }

  const isFinal = claim.status === 'remboursee' || claim.status === 'refusee';

  return (
    <div className="space-y-5 max-w-2xl">
      <button onClick={() => navigate('/admin/reclamations')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink"><ArrowLeft size={15} /> Réclamations</button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{claim.claimType === 'retour_echange' ? 'Retour / échange' : 'Problème signalé'}</h1>
          <p className="text-sm text-ink/55 mt-1">
            Commande{' '}
            <button onClick={() => navigate(`/admin/commandes/${claim.orderId}`)} className="font-mono font-medium text-burgundy hover:underline">{claim.orderNumber}</button>
            {' '}· {claim.shopName}
          </p>
        </div>
        <StatusChip status={claim.status} size="md" />
      </div>

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-ink/45">Motif</p><p className="text-ink font-medium">{claim.motif}</p></div>
          <div><p className="text-xs text-ink/45">Solution souhaitée</p><p className="text-ink font-medium">{solutionLabels[claim.desiredSolution] ?? claim.desiredSolution}</p></div>
          <div>
            <p className="text-xs text-ink/45">Date de réception</p>
            <p className="text-ink font-medium">{claim.receptionDate ?? '—'}{claim.receptionDateIsEstimate && <span className="text-ink/40 font-normal"> (estimée)</span>}</p>
          </div>
          {claim.refundAmount != null && (
            <div><p className="text-xs text-ink/45">Montant remboursé</p><p className="text-ink font-medium">{claim.refundAmount} FCFA</p></div>
          )}
        </div>
        {claim.details && (
          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink/45 mb-1">Détails du client</p>
            <p className="text-sm text-ink/70">{claim.details}</p>
          </div>
        )}
        {claim.sellerResponse && (
          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink/45 mb-1">Réponse du vendeur</p>
            <p className="text-sm text-ink/70">{claim.sellerResponse}</p>
          </div>
        )}
        {claim.refusalReason && (
          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink/45 mb-1">Motif de refus</p>
            <p className="text-sm text-burgundy">{claim.refusalReason}</p>
          </div>
        )}
      </div>

      {/* Evidence — never deletable from this app (no DELETE policy exists
          on order_claims), only viewable here. */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Preuves photo du client</h2>
        {claim.photoUrls.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-ink/40"><ImageOff size={14} /> Aucune photo fournie</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {claim.photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="h-24 w-24 rounded-lg overflow-hidden bg-cream block">
                <img src={url} alt={`Preuve ${i + 1}`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Actions — the only path that can ever change claim.status;
          "Remboursée" requires a real amount and is never set automatically
          or by simulating a payment provider call. */}
      {!isFinal && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Traiter la réclamation</h2>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Note interne (facultatif, visible dans l'historique)</label>
            <textarea className="input-field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {claim.status === 'demande_recue' && (
              <button onClick={() => void applyStatus('en_cours_examen')} disabled={acting} className="btn-outline">Marquer en cours d'examen</button>
            )}
            {(claim.status === 'demande_recue' || claim.status === 'en_cours_examen') && (
              <button onClick={() => void applyStatus('approuvee')} disabled={acting} className="btn-outline">Approuver</button>
            )}
            {claim.status === 'approuvee' && (
              <button onClick={() => void applyStatus('en_cours_paiement')} disabled={acting} className="btn-outline">Marquer remboursement en cours</button>
            )}
          </div>

          <div className="border-t border-line pt-3 space-y-2">
            <label className="block text-xs font-medium text-ink/60">Motif de refus (requis pour refuser)</label>
            <input className="input-field" value={refusalReason} onChange={(e) => setRefusalReason(e.target.value)} placeholder="Ex : délai de rétractation dépassé, article renvoyé non conforme..." />
            <button onClick={() => void applyStatus('refusee')} disabled={acting} className="w-full rounded-lg border border-burgundy/30 px-4 py-2.5 text-sm font-medium text-burgundy hover:bg-burgundy/5 transition-colors disabled:opacity-40">
              Refuser la demande
            </button>
          </div>

          {(claim.status === 'approuvee' || claim.status === 'en_cours_paiement') && (
            <div className="border-t border-line pt-3 space-y-2">
              <label className="block text-xs font-medium text-ink/60">Montant réellement remboursé (FCFA) — à utiliser uniquement après un virement Wave/Orange Money/PayPal confirmé, jamais avant</label>
              <input type="number" min="0" className="input-field" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Ex : 15000" />
              <button onClick={() => void applyStatus('remboursee')} disabled={acting} className="btn-primary w-full">
                {acting ? 'Enregistrement…' : 'Confirmer le remboursement'}
              </button>
            </div>
          )}

          {actionError && <p className="text-sm text-burgundy">{actionError}</p>}
        </div>
      )}

      {/* Full traceability */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Historique</h2>
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-3 text-sm">
              <div className="flex-shrink-0 mt-0.5"><StatusChip status={e.newStatus} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-ink/70">{eventRoleLabels[e.changedByRole]}{e.note ? ` — ${e.note}` : ''}</p>
                <p className="text-xs text-ink/40 mt-0.5">{formatDateTime(e.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
