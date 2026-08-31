import { useState } from 'react';
import { usePro } from '../../ProContext';
import VendorNoticeBanner from '../../components/VendorNoticeBanner';
import { Check, KeyRound, Image as ImageIcon, Camera } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

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

  const handleLogoFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setForm((f) => ({ ...f, logo: URL.createObjectURL(file) }));
  };

  const handleBannerFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setForm((f) => ({ ...f, banner: URL.createObjectURL(file) }));
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
      <div className="card p-5 space-y-5">
        {/* Logo upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Logo de la boutique</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
              {form.logo ? (
                <SmartImage src={form.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={20} /></div>
              )}
            </div>
            <label className="btn-outline cursor-pointer text-sm">
              {form.logo ? 'Changer le logo' : 'Ajouter le logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoFile(e.target.files)} />
            </label>
          </div>
        </div>

        {/* Banner upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Image de couverture</label>
          <div className="h-32 overflow-hidden rounded-lg border border-line bg-cream">
            {form.banner ? (
              <SmartImage src={form.banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={24} /></div>
            )}
          </div>
          <label className="btn-outline mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm">
            <Camera size={14} /> {form.banner ? "Changer l'image de couverture" : "Ajouter une image de couverture"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerFile(e.target.files)} />
          </label>
          <p className="mt-1.5 text-xs text-ink/40">Vos photos sont automatiquement recadrées à l'affichage, sans déformation.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Utilisez le nom sous lequel vos clients vous connaissent.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">
            Présentez ce que vous vendez, votre spécialité et ce qui distingue votre boutique. Cette description est visible publiquement — mentionnez naturellement vos produits, votre style et votre localisation.
          </p>
          <p className="mt-1 text-xs text-ink/35 italic">
            Ex. : « Maison Fatou propose des vêtements féminins modernes et des pièces d'inspiration africaine à Dakar : robes, ensembles et tenues pour toutes les occasions. »
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
          <input className="input-field" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Numéro permettant à Ezial de vous contacter.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse / quartier</label>
          <input className="input-field" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Indiquez précisément où se trouve votre boutique ou votre point de retrait.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Horaires</label>
          <input className="input-field" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Indiquez les horaires auxquels les commandes peuvent être préparées ou retirées.</p>
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
    </div>
  );
}
