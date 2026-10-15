import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchSellerClaims, type SellerClaim } from '@/lib/supabaseSellerClaims';
import { StatusChip } from '../../components/StatusChip';
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SellerClaims() {
  const { navigate } = usePro();
  const [claims, setClaims] = useState<SellerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setClaims(await fetchSellerClaims());
    } catch {
      setLoadError('Impossible de charger les réclamations. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Réclamations</h1>
        <p className="text-sm text-ink/55 mt-1">Retours, échanges et signalements concernant vos produits. Vous pouvez proposer une solution — la décision finale (remboursement, refus) revient à l'équipe Ezial.</p>
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <div className="card divide-y divide-line">
          {claims.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink/45">Aucune réclamation pour le moment</p>
          ) : (
            claims.map((claim) => (
              <button key={claim.id} onClick={() => navigate(`/seller/reclamations/${claim.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-ink">{claim.orderNumber}</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink/5 text-ink/50">
                      {claim.claimType === 'retour_echange' ? 'Retour/échange' : 'Problème'}
                    </span>
                  </div>
                  <p className="text-xs text-ink/45 mt-0.5">{claim.motif} · {formatDate(claim.createdAt)}</p>
                </div>
                <div className="flex-shrink-0"><StatusChip status={claim.status} /></div>
                <ChevronRight size={16} className="text-ink/20 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
