import { useState } from 'react';
import { X, RotateCcw, AlertTriangle, Camera } from 'lucide-react';
import { getShop } from '@/data/shops';
import { createOrderClaim, type ClaimType, type DesiredSolution } from '@/lib/supabaseClaims';
import type { Order } from '@/store/AppContext';

const motifsByType: Record<ClaimType, string[]> = {
  retour_echange: ['Mauvaise taille ou mauvaise coupe', 'Je ne souhaite plus cet article (rétractation)', 'Erreur de couleur ou de modèle reçu', 'Autre raison'],
  probleme: ['Article défectueux ou endommagé', 'Article non conforme à la description', 'Commande non reçue', 'Erreur dans les articles reçus', 'Autre problème'],
};

const solutions: { id: DesiredSolution; label: string }[] = [
  { id: 'remboursement', label: 'Remboursement' },
  { id: 'echange', label: 'Échange' },
  { id: 'autre', label: 'Autre solution' },
];

const MAX_PHOTOS = 4;

// Customer-facing entry point for both "Demander un retour ou un échange"
// et "Signaler un problème" — claimType is fixed by which button opened
// this modal; everything else (boutique concernée, motif, solution
// souhaitée, détails, photos) is chosen here. Writes only ever go through
// create_order_claim() (see the migration) — never a direct table insert.
export default function ClaimModal({
  order, claimType, customerId, onClose, onSubmitted,
}: {
  order: Order;
  claimType: ClaimType;
  customerId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const shopOptions = order.shopFulfillments.filter((f) => f.orderShopId);
  const [orderShopId, setOrderShopId] = useState<string | null>(shopOptions.length === 1 ? shopOptions[0].orderShopId ?? null : null);
  const [orderItemId, setOrderItemId] = useState<string | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [solution, setSolution] = useState<DesiredSolution | null>(null);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [receptionDate, setReceptionDate] = useState('');
  const [needsReceptionDate, setNeedsReceptionDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneRef, setDoneRef] = useState<string | null>(null);

  const itemsForShop = orderShopId ? order.items.filter((it) => shopOptions.find((s) => s.orderShopId === orderShopId)?.shopId === it.shopId) : [];

  const title = claimType === 'retour_echange' ? 'Demander un retour ou un échange' : 'Signaler un problème';

  const canSubmit = Boolean(orderShopId && motif && solution);

  const submit = async () => {
    if (!orderShopId || !motif || !solution) { setError('Merci de compléter les champs ci-dessus.'); return; }
    setError('');
    setSubmitting(true);
    const result = await createOrderClaim({
      customerId,
      orderShopId,
      orderItemId,
      claimType,
      motif,
      desiredSolution: solution,
      details,
      photos,
      customerReceptionDate: needsReceptionDate && receptionDate ? receptionDate : null,
    });
    setSubmitting(false);
    if (result.needsReceptionDate) { setNeedsReceptionDate(true); setError('Merci d\'indiquer la date à laquelle vous avez reçu ce colis.'); return; }
    if (result.error) { setError(result.error); return; }
    setDoneRef(result.claimId ?? null);
    onSubmitted?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ink flex items-center gap-1.5">
            {claimType === 'retour_echange' ? <RotateCcw size={16} /> : <AlertTriangle size={16} />} {title}
          </h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>

        {doneRef ? (
          <div className="py-4 text-center">
            <p className="text-sm text-ink/70">Votre demande a été transmise. Nous reviendrons vers vous rapidement.</p>
            <p className="mt-2 text-xs text-ink/45">Statut actuel : Demande reçue — suivez son avancement depuis le détail de votre commande.</p>
            <button onClick={onClose} className="btn-primary w-full mt-5">Fermer</button>
          </div>
        ) : (
          <div className="space-y-4">
            {shopOptions.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Quelle boutique est concernée ?</label>
                <div className="space-y-1.5">
                  {shopOptions.map((s) => {
                    const shop = getShop(s.shopId);
                    return (
                      <button
                        key={s.orderShopId}
                        type="button"
                        onClick={() => { setOrderShopId(s.orderShopId ?? null); setOrderItemId(null); }}
                        className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${orderShopId === s.orderShopId ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}
                      >
                        {shop?.name ?? 'Boutique'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {orderShopId && itemsForShop.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Article concerné (facultatif)</label>
                <select className="input-field" value={orderItemId ?? ''} onChange={(e) => setOrderItemId(e.target.value || null)}>
                  <option value="">Toute la commande de cette boutique</option>
                  {itemsForShop.filter((it) => it.orderItemId).map((it) => <option key={it.orderItemId} value={it.orderItemId}>{it.productName ?? it.productId}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Motif</label>
              <div className="space-y-1.5">
                {motifsByType[claimType].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMotif(m)}
                    className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${motif === m ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Solution souhaitée</label>
              <div className="flex gap-2">
                {solutions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSolution(s.id)}
                    className={`flex-1 rounded-lg border p-2.5 text-center text-sm transition-colors ${solution === s.id ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Détails (facultatif)</label>
              <textarea className="input-field" rows={3} placeholder="Décrivez la situation…" value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Photos (facultatif, {MAX_PHOTOS} max)</label>
              <label className="flex items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed border-line cursor-pointer hover:border-burgundy/30 transition-colors text-ink/45 text-xs">
                <Camera size={18} /> {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} ajoutée${photos.length > 1 ? 's' : ''}` : 'Ajouter des photos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
                    setPhotos(files);
                  }}
                />
              </label>
            </div>

            {needsReceptionDate && (
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Date de réception du colis</label>
                <input type="date" className="input-field" max={new Date().toISOString().split('T')[0]} value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} />
              </div>
            )}

            {error && <p className="text-sm text-burgundy">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void submit()} disabled={!canSubmit || submitting} className="btn-primary flex-1 disabled:opacity-40">
                {submitting ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
