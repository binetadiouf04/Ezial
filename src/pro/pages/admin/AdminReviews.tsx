import { useState, useEffect, useCallback } from 'react';
import { fetchAdminReviews, hideReview, unhideReview, deleteReviewAdmin, type AdminReview } from '@/lib/supabaseAdminReviews';
import Rating from '@/components/Rating';
import { Loader2, AlertCircle, Flag, EyeOff, Eye, Trash2, X } from 'lucide-react';

const hideReasons = ['Avis frauduleux / faux achat', 'Contenu insultant ou diffamatoire', 'Hors sujet / spam', 'Données personnelles exposées'];

export default function AdminReviews() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [onlyReported, setOnlyReported] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [hideTarget, setHideTarget] = useState<AdminReview | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const all = await fetchAdminReviews();
      all.sort((a, b) => b.reportCount - a.reportCount || b.createdAt.localeCompare(a.createdAt));
      setReviews(all);
    } catch {
      setLoadError('Impossible de charger les avis. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const confirmHide = async (reason: string) => {
    if (!hideTarget) return;
    setActing(hideTarget.id);
    const result = await hideReview(hideTarget.id, reason);
    setActing(null);
    if (!result.error) setReviews((prev) => prev.map((r) => r.id === hideTarget.id ? { ...r, isHidden: true, hiddenReason: reason } : r));
    setHideTarget(null);
  };

  const handleUnhide = async (review: AdminReview) => {
    setActing(review.id);
    const result = await unhideReview(review.id);
    setActing(null);
    if (!result.error) setReviews((prev) => prev.map((r) => r.id === review.id ? { ...r, isHidden: false, hiddenReason: null } : r));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActing(deleteTarget.id);
    const result = await deleteReviewAdmin(deleteTarget.id);
    setActing(null);
    if (!result.error) setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const filtered = onlyReported ? reviews.filter((r) => r.reportCount > 0) : reviews;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Modération des avis</h1>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={onlyReported} onChange={(e) => setOnlyReported(e.target.checked)} className="accent-burgundy" />
            Signalés uniquement ({reviews.filter((r) => r.reportCount > 0).length})
          </label>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun avis à modérer.</p></div>
            ) : (
              filtered.map((review) => (
                <div key={review.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{review.productName}</p>
                      {review.shopName && <p className="text-xs text-ink/45">{review.shopName}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {review.reportCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-burgundy/10 px-2 py-0.5 text-[11px] font-semibold text-burgundy">
                          <Flag size={11} /> {review.reportCount} signalement{review.reportCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {review.isHidden && (
                        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink/50">Masqué</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2"><Rating rating={review.rating} showCount={false} /></div>
                  {review.comment && <p className="mt-2 text-sm text-ink/70">{review.comment}</p>}
                  {review.isHidden && review.hiddenReason && (
                    <p className="mt-2 text-xs text-ink/45">Motif de masquage : {review.hiddenReason}</p>
                  )}
                  <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
                    {review.isHidden ? (
                      <button onClick={() => void handleUnhide(review)} disabled={acting === review.id} className="flex items-center gap-1.5 text-xs font-medium text-ink/60 hover:text-green-700">
                        <Eye size={14} /> Afficher à nouveau
                      </button>
                    ) : (
                      <button onClick={() => setHideTarget(review)} disabled={acting === review.id} className="flex items-center gap-1.5 text-xs font-medium text-ink/60 hover:text-burgundy">
                        <EyeOff size={14} /> Masquer
                      </button>
                    )}
                    <button onClick={() => setDeleteTarget(review)} disabled={acting === review.id} className="flex items-center gap-1.5 text-xs font-medium text-ink/40 hover:text-burgundy">
                      <Trash2 size={14} /> Supprimer définitivement
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {hideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setHideTarget(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Masquer cet avis</h3>
              <button onClick={() => setHideTarget(null)}><X size={18} className="text-ink/40" /></button>
            </div>
            <p className="mb-4 text-xs text-ink/50">Le motif est conservé comme trace de modération interne, jamais affiché publiquement.</p>
            <HideReasonForm onCancel={() => setHideTarget(null)} onConfirm={confirmHide} />
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ink mb-2">Supprimer définitivement ?</h3>
            <p className="mb-5 text-sm text-ink/60">Cette action est irréversible et supprime l'avis, ses photos et ses signalements. Préférez « Masquer » si un doute subsiste.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void confirmDelete()} disabled={acting === deleteTarget.id} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40">
                {acting === deleteTarget.id ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HideReasonForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => Promise<void> | void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setError('Précisez le motif de masquage.'); return; }
    setError('');
    setSaving(true);
    await onConfirm(reason.trim());
    setSaving(false);
  };

  return (
    <>
      <div className="space-y-1.5 mb-4">
        {hideReasons.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${reason === r ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}>
            {r}
          </button>
        ))}
      </div>
      <label className="block text-xs font-medium text-ink/60 mb-1.5">Motif précis</label>
      <textarea className="input-field" rows={2} placeholder="Détaillez la décision…" value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} />
      {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
        <button onClick={() => void submit()} disabled={saving} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40">
          {saving ? 'Envoi…' : 'Masquer'}
        </button>
      </div>
    </>
  );
}
