import { useState } from 'react';
import { usePro } from '../../ProContext';
import VendorNoticeBanner from '../../components/VendorNoticeBanner';
import { Check, KeyRound } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const shopStatusLabels: Record<string, string> = {
  active: 'Active', pending: 'En attente', flagged: 'Signalée', suspended: 'Suspendue', inactive: 'Désactivée',
};

export default function SellerShop() {
  const { sellerShop, updateSellerShop, updateSellerPin, identifier, getLatestModeration } = usePro();
  const latestModeration = sellerShop ? getLatestModeration('shop', sellerShop.id) : null;
  const [form, setForm] = useState({
    name: sellerShop?.name ?? '',
    description: sellerShop?.description ?? '',
    contact: sellerShop?.contact ?? '',
    pickupAddress: sellerShop?.pickupAddress ?? '',
    banner: sellerShop?.banner ?? '',
    logo: sellerShop?.logo ?? '',
    pickupEnabled: sellerShop?.pickupEnabled ?? false,
    deliveryEnabled: sellerShop?.deliveryEnabled ?? true,
    hours: 'Lun–Sam : 9h–18h',
  });
  const [saved, setSaved] = useState(false);

  // PIN change — fields are never pre-filled with the current PIN, and are
  // cleared right after a successful save, so it's never shown in clear.
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaved, setPinSaved] = useState(false);

  const handleSave = () => {
    updateSellerShop(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePin = () => {
    setPinError('');
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('Le PIN doit contenir exactement 4 chiffres.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('Les deux PIN ne correspondent pas.');
      return;
    }
    const ok = updateSellerPin(newPin);
    if (!ok) {
      setPinError('Le PIN doit contenir exactement 4 chiffres.');
      return;
    }
    setNewPin('');
    setConfirmPin('');
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Ma boutique</h1>
        <p className="mt-1 text-sm text-ink/55">Gérez les informations de votre boutique</p>
      </div>

      {latestModeration && <VendorNoticeBanner entry={latestModeration} />}

      {/* Seller identifier — read-only */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink/50">Identifiant vendeur</p>
          <p className="mt-1 font-mono text-sm font-semibold text-ink">{identifier}</p>
        </div>
        <span className="text-xs text-ink/35">Non modifiable</span>
      </div>

      {/* PIN — security */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><KeyRound size={15} className="text-ink/40" /> Code PIN</h2>
          <p className="mt-1 text-xs text-ink/45">Utilisé avec votre identifiant pour vous connecter. Il n'est jamais affiché une fois enregistré.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Nouveau PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="input-field font-mono tracking-[0.5em]"
              placeholder="••••"
              maxLength={4}
              value={newPin}
              onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Confirmer le PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="input-field font-mono tracking-[0.5em]"
              placeholder="••••"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            />
          </div>
        </div>
        {pinError && <p className="text-xs text-burgundy">{pinError}</p>}
        <div className="flex items-center gap-3">
          <button onClick={handleSavePin} className="btn-outline">Enregistrer le PIN</button>
          {pinSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> PIN mis à jour</span>}
        </div>
      </div>

      {/* Shop info form */}
      <div className="card p-5 space-y-4">
        {/* Logo preview */}
        <div className="flex items-center gap-3">
          {form.logo && <SmartImage src={form.logo} alt="" className="h-14 w-14 rounded-lg object-cover" />}
          <div className="flex-1">
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Logo (URL)</label>
            <input className="input-field" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
          </div>
        </div>

        {/* Banner preview */}
        {form.banner && (
          <div className="rounded-lg overflow-hidden h-32 bg-cream">
            <SmartImage src={form.banner} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Image de couverture (URL)</label>
          <input className="input-field" value={form.banner} onChange={(e) => setForm({ ...form, banner: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
          <input className="input-field" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse / quartier</label>
          <input className="input-field" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Horaires</label>
          <input className="input-field" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        </div>

        {/* Fulfillment options */}
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.deliveryEnabled} onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Livraison Ezial activée
          </label>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.pickupEnabled} onChange={(e) => setForm({ ...form, pickupEnabled: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Retrait en boutique activé
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} className="btn-primary">Enregistrer</button>
          {saved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Enregistré</span>}
        </div>
      </div>

      {/* Non-modifiable info */}
      <div className="card p-4 space-y-2">
        <p className="text-xs font-medium text-ink/50">Informations non modifiables</p>
        <div className="flex justify-between text-sm"><span className="text-ink/45">Commission Ezial</span><span className="font-medium text-ink">8%</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink/45">Statut du compte</span><span className="font-medium text-ink">{shopStatusLabels[sellerShop?.status ?? ''] ?? sellerShop?.status}</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink/45">Plan</span><span className="font-medium text-ink">{sellerShop?.plan === 'founder' ? 'Founder' : 'Standard'}</span></div>
      </div>
    </div>
  );
}
