import { useCallback, useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminShopFinanceDetail, recordSellerPayout, type AdminShopFinanceDetail as AdminShopFinanceDetailData } from '@/lib/supabaseAdminFinances';
import { formatFCFA } from '../../data';
import { ArrowLeft, Loader2, ShoppingBag, ArrowUpCircle } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminShopFinanceDetail({ shopId }: { shopId: string }) {
  const { navigate } = usePro();
  const [detail, setDetail] = useState<AdminShopFinanceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchAdminShopFinanceDetail(shopId);
      setDetail(data);
      if (!data) setLoadError('Boutique introuvable.');
    } catch {
      setLoadError('Impossible de charger les finances de la boutique. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);

  const openPayoutForm = () => {
    setPayoutAmount('');
    setPayoutError('');
    setShowPayoutForm(true);
  };

  const submitPayout = async () => {
    const amount = parseInt(payoutAmount, 10);
    if (!amount || amount <= 0) { setPayoutError('Saisissez un montant valide.'); return; }
    setPayoutError('');
    setSaving(true);
    const result = await recordSellerPayout(shopId, amount);
    setSaving(false);
    if (result.error) { setPayoutError(result.error); return; }
    setShowPayoutForm(false);
    await load();
  };

  if (loading) {
    return <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (loadError || !detail) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">{loadError || 'Boutique introuvable'}</p>
        <button onClick={() => navigate('/admin/finances')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/finances')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Finances
      </button>

      <div className="card p-5 flex items-center gap-4">
        {detail.logoUrl && <SmartImage src={detail.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />}
        <h1 className="font-display text-lg font-semibold text-ink truncate flex-1">{detail.shopName}</h1>
      </div>

      <div className="card p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-ink/55">Total des ventes</span>
          <span className="font-medium text-ink">{formatFCFA(detail.sales)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink/55">Commission Ezial cumulée</span>
          <span className="font-medium text-red-500">- {formatFCFA(detail.commission)}</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-line">
          <span className="font-semibold text-ink">Net dû au vendeur</span>
          <span className="font-semibold text-ink">{formatFCFA(detail.netToSeller)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink/55">Déjà versé</span>
          <span className="font-medium text-ink">{formatFCFA(detail.alreadyPaid)}</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-line">
          <span className="font-semibold text-ink">Solde restant à verser</span>
          <span className="font-semibold text-ink">{formatFCFA(detail.remaining)}</span>
        </div>

        <button onClick={openPayoutForm} disabled={detail.remaining <= 0} className="btn-primary w-full mt-2 disabled:opacity-40">
          Enregistrer un versement
        </button>
      </div>

      {showPayoutForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={() => setShowPayoutForm(false)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Enregistrer un versement</h2>
            <p className="mt-1 text-xs text-ink/50">Solde restant dû : {formatFCFA(detail.remaining)}</p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Montant versé (FCFA)</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-field"
                value={payoutAmount}
                onChange={(e) => { setPayoutAmount(e.target.value); setPayoutError(''); }}
                placeholder="50000"
              />
            </div>
            {payoutError && <p className="mt-2 text-sm text-burgundy">{payoutError}</p>}
            <div className="flex gap-3 pt-4">
              <button onClick={() => setShowPayoutForm(false)} className="btn-outline flex-1">Annuler</button>
              <button onClick={submitPayout} disabled={saving} className="btn-primary flex-1">{saving ? 'Enregistrement…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Historique</h2>
        {detail.history.length === 0 ? (
          <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun mouvement pour l'instant.</p></div>
        ) : (
          <div className="space-y-2">
            {detail.history.map((entry) => (
              <div key={entry.id} className="card p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.kind === 'sale' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                  {entry.kind === 'sale' ? <ShoppingBag size={16} /> : <ArrowUpCircle size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{entry.kind === 'sale' ? (entry.orderNumber ?? 'Commande') : 'Versement effectué'}</p>
                  <p className="text-xs text-ink/45">{formatDateTime(entry.date)}</p>
                  {entry.kind === 'sale' && (
                    <p className="text-xs text-ink/45 mt-0.5">Produits {formatFCFA(entry.grossAmount)} · Commission {formatFCFA(entry.commissionAmount)}</p>
                  )}
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${entry.kind === 'sale' ? 'text-ink' : 'text-green-700'}`}>
                  {entry.kind === 'sale' ? '+' : '-'}{formatFCFA(entry.netAmount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
