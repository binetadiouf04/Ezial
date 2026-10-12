import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminClaims, type AdminClaim } from '@/lib/supabaseAdminClaims';
import { claimStatusLabels, type ClaimStatus } from '@/lib/supabaseClaims';
import { StatusChip } from '../../components/StatusChip';
import { Search, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

type Filter = 'all' | 'open' | ClaimStatus;

const openStatuses: ClaimStatus[] = ['demande_recue', 'en_cours_examen', 'approuvee', 'en_cours_paiement'];

export default function AdminClaims() {
  const { navigate } = usePro();
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setClaims(await fetchAdminClaims());
    } catch {
      setLoadError('Impossible de charger les réclamations. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = claims
    .filter((c) => (filter === 'all' ? true : filter === 'open' ? openStatuses.includes(c.status) : c.status === filter))
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.orderNumber.toLowerCase().includes(q) || c.shopName.toLowerCase().includes(q) || c.motif.toLowerCase().includes(q);
    });

  const openCount = claims.filter((c) => openStatuses.includes(c.status)).length;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Réclamations et remboursements</h1>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('open')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === 'open' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
          En cours{openCount > 0 ? ` (${openCount})` : ''}
        </button>
        <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === 'all' ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
          Toutes
        </button>
        {(['remboursee', 'refusee'] as ClaimStatus[]).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === s ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
            {claimStatusLabels[s]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher (n° commande, boutique, motif)" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink/45">Aucune réclamation trouvée</p>
          ) : (
            filtered.map((claim) => (
              <button key={claim.id} onClick={() => navigate(`/admin/reclamations/${claim.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-ink">{claim.orderNumber}</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink/5 text-ink/50">
                      {claim.claimType === 'retour_echange' ? 'Retour/échange' : 'Problème'}
                    </span>
                  </div>
                  <p className="text-xs text-ink/45 mt-0.5">{claim.shopName} · {claim.motif} · {formatDate(claim.createdAt)}</p>
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
