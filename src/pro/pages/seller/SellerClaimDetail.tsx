import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchSellerClaimDetail, sellerRespondToClaim, type SellerClaim } from '@/lib/supabaseSellerClaims';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Loader2, AlertCircle, ImageOff } from 'lucide-react';

const solutionLabels: Record<string, string> = { remboursement: 'Remboursement', echange: 'Échange', autre: 'Autre' };

// Seller view of a single claim — read-only except for one thing: proposing
// a response. RLS already guarantees this claim belongs to the seller's
// own shop (order_claims_select_seller); there is no status-change action
// here at all, by design — only Ezial admin can approve, refuse or confirm
// a refund (admin_update_claim_status()).
export default function SellerClaimDetail({ claimId }: { claimId: string }) {
  const { navigate } = usePro();
  const [claim, setClaim] = useState<SellerClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const c = await fetchSellerClaimDetail(claimId);
      if (!c) { setLoadError('Réclamation introuvable.'); return; }
      setClaim(c);
      setResponse(c.sellerResponse ?? '');
    } catch {
      setLoadError('Impossible de charger cette réclamation. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => { void load(); }, [load]);

  const submitResponse = async () => {
    if (!claim || !response.trim()) return;
    setSubmitError('');
    setSubmitting(true);
    const result = await sellerRespondToClaim(claim.id, response.trim());
    setSubmitting(false);
    if (result.error) { setSubmitError(result.error); return; }
    void load();
  };

  if (loading) return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  if (loadError || !claim) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/seller/reclamations')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink"><ArrowLeft size={15} /> Réclamations</button>
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-xl">
      <button onClick={() => navigate('/seller/reclamations')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink"><ArrowLeft size={15} /> Réclamations</button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{claim.claimType === 'retour_echange' ? 'Retour / échange' : 'Problème signalé'}</h1>
          <p className="text-sm text-ink/55 mt-1">Commande <span className="font-mono font-medium">{claim.orderNumber}</span></p>
        </div>
        <StatusChip status={claim.status} size="md" />
      </div>

      <div className="card p-5 space-y-3">
        <div><p className="text-xs text-ink/45">Motif</p><p className="text-sm text-ink font-medium">{claim.motif}</p></div>
        <div><p className="text-xs text-ink/45">Solution souhaitée par le client</p><p className="text-sm text-ink font-medium">{solutionLabels[claim.desiredSolution] ?? claim.desiredSolution}</p></div>
        {claim.details && (
          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink/45 mb-1">Détails du client</p>
            <p className="text-sm text-ink/70">{claim.details}</p>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Photos fournies par le client</h2>
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

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Votre proposition</h2>
        <p className="text-xs text-ink/50">Votre réponse est transmise à l'équipe Ezial, qui prend la décision finale avec le client.</p>
        <textarea className="input-field" rows={3} placeholder="Ex : nous proposons un échange de taille sans frais supplémentaires..." value={response} onChange={(e) => setResponse(e.target.value)} />
        {submitError && <p className="text-sm text-burgundy">{submitError}</p>}
        <button onClick={() => void submitResponse()} disabled={submitting || !response.trim()} className="btn-primary w-full disabled:opacity-40">
          {submitting ? 'Envoi…' : 'Envoyer la proposition'}
        </button>
      </div>
    </div>
  );
}
