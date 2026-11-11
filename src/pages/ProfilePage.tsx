import { useState, useEffect } from 'react';
import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order, type CustomerAddressInput, quartiers } from '@/store/AppContext';
import { deliveryStatusLabels, pickupStepLabels, computeDeliveryStepStatus } from '@/data/orderStatusLabels';
import { fetchOrderDeliveryMissionStatuses } from '@/lib/supabaseOrders';
import { formatFCFA } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import SmartImage from '@/components/SmartImage';
import NotificationOptIn from '@/components/NotificationOptIn';
import CustomerAuthPanel from '@/components/CustomerAuthPanel';
import MarketingPushToggle from '@/components/MarketingPushToggle';
import PasswordField from '@/components/PasswordField';
import PhoneField from '@/components/PhoneField';
import { capitalizeFirst } from '@/lib/authErrors';
import { fetchOwnShopForDeletionWarning } from '@/lib/supabaseAccountDeletion';
import { User, Heart, ShoppingBag, LogOut, ChevronRight, Truck, Store, Check, AlertCircle, Loader2, Trash2, MapPin, Plus, Pencil } from 'lucide-react';

const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-blue-50 text-blue-700', delivering: 'bg-blue-50 text-blue-700', delivered: 'bg-ink/5 text-ink/60',
};
const pickupStepColors: Record<PickupStepStatus, string> = {
  preparing: 'bg-amber-50 text-amber-700', ready_for_pickup: 'bg-green-50 text-green-700', picked_up: 'bg-ink/5 text-ink/60',
};

function getOrderStatusLabel(order: Order, effectiveStatus: DeliveryStepStatus): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepLabels).indexOf(a) - Object.keys(pickupStepLabels).indexOf(b))[0];
    return pickupStepLabels[worst] ?? pickupStepLabels.preparing;
  }
  return deliveryStatusLabels[effectiveStatus] ?? deliveryStatusLabels.confirmed;
}

function getOrderStatusColor(order: Order, effectiveStatus: DeliveryStepStatus): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepColors).indexOf(a) - Object.keys(pickupStepColors).indexOf(b))[0];
    return pickupStepColors[worst] ?? deliveryStatusColors.confirmed;
  }
  return deliveryStatusColors[effectiveStatus] ?? deliveryStatusColors.confirmed;
}

type Tab = 'orders' | 'favorites' | 'addresses' | 'info';

interface InfoForm { firstName: string; lastName: string; phone: string; email: string; quartier: string; landmark: string }

// Minimalist landing shown before the actual login/signup form — same
// two-step shape as Ezial Pro's own entry page (ProEntryPage.tsx): a
// plain "Bienvenue" screen first, the real form only once a choice is
// made. Never gates product browsing (ProfilePage is only ever reached
// via "Compte" in the nav, never required to view the catalog).
// The seller space has its own entry, « Ma boutique » (menu and header).
function AccountEntryPage({ onChoose }: { onChoose: (view: 'login' | 'signup') => void }) {
  // No logo here — Header already shows it on this same page, repeating
  // it below would just be visual clutter.
  return (
    <div className="mx-auto max-w-sm py-10 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Bienvenue sur Ezial</h1>
      <p className="mt-2 text-sm text-ink/55">Suivez vos commandes, vos favoris et vos adresses depuis votre compte.</p>

      <div className="mt-8 flex flex-col gap-2.5">
        <button onClick={() => onChoose('signup')} className="btn-primary w-full">Créer mon compte</button>
        <button onClick={() => onChoose('login')} className="btn-outline w-full">Se connecter</button>
      </div>
    </div>
  );
}

const emptyAddressForm: CustomerAddressInput = { firstName: '', lastName: '', phone: '', addressLine: '', quartier: quartiers[0] ?? '', city: 'Dakar', instructions: '' };

function AddressForm({ initial, onCancel, onSubmit, submitting, error }: { initial: CustomerAddressInput; onCancel: () => void; onSubmit: (input: CustomerAddressInput) => void; submitting: boolean; error: string }) {
  const [form, setForm] = useState<CustomerAddressInput>(initial);
  const update = (field: keyof CustomerAddressInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: field === 'firstName' || field === 'lastName' ? capitalizeFirst(value) : value }));
  const canSubmit = form.firstName.trim() && form.lastName.trim() && form.phone.trim() && form.addressLine.trim();

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label><input className="input-field" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label><input className="input-field" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label><PhoneField value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} className="input-field" /></div>
      <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse</label><input className="input-field" placeholder="Ex: Villa 12, Cité Keur Gorgui" value={form.addressLine} onChange={(e) => update('addressLine', e.target.value)} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Quartier</label>
          <select className="input-field" value={form.quartier} onChange={(e) => update('quartier', e.target.value)}>
            {quartiers.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Ville</label><input className="input-field" value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Instructions de livraison (facultatif)</label><textarea className="input-field" rows={2} placeholder="Ex: portail bleu, sonner deux fois..." value={form.instructions} onChange={(e) => update('instructions', e.target.value)} /></div>
      {error && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      <div className="flex gap-3">
        <button onClick={() => onSubmit(form)} disabled={submitting || !canSubmit} className="btn-primary">{submitting ? 'Enregistrement...' : 'Enregistrer'}</button>
        <button onClick={onCancel} className="btn-outline">Annuler</button>
      </div>
    </div>
  );
}

function AddressesTab() {
  const { addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } = useApp();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleAdd = async (input: CustomerAddressInput) => {
    setSubmitting(true); setFormError('');
    const result = await addAddress(input);
    setSubmitting(false);
    if (result.error) { setFormError(result.error); return; }
    setAdding(false);
  };

  const handleUpdate = async (id: string, input: CustomerAddressInput) => {
    setSubmitting(true); setFormError('');
    const result = await updateAddress(id, input);
    setSubmitting(false);
    if (result.error) { setFormError(result.error); return; }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    await deleteAddress(id);
    setBusyId(null);
    setDeleteTargetId(null);
  };

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    await setDefaultAddress(id);
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      {addresses.length === 0 && !adding && (
        <div className="card p-8 text-center">
          <MapPin size={28} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/55 mb-4">Aucune adresse enregistrée.</p>
          <button onClick={() => setAdding(true)} className="btn-primary inline-flex items-center gap-1.5"><Plus size={16} /> Ajouter une adresse</button>
        </div>
      )}

      {addresses.map((addr) => editingId === addr.id ? (
        <AddressForm
          key={addr.id}
          initial={{ firstName: addr.firstName, lastName: addr.lastName, phone: addr.phone, addressLine: addr.addressLine, quartier: addr.quartier, city: addr.city, instructions: addr.instructions }}
          submitting={submitting}
          error={formError}
          onCancel={() => { setEditingId(null); setFormError(''); }}
          onSubmit={(input) => void handleUpdate(addr.id, input)}
        />
      ) : (
        <div key={addr.id} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-ink">{addr.firstName} {addr.lastName}</p>
                {addr.isDefault && <span className="rounded-full bg-burgundy/10 px-2 py-0.5 text-[11px] font-medium text-burgundy">Adresse par défaut</span>}
              </div>
              <p className="mt-1 text-sm text-ink/70">{addr.addressLine}</p>
              <p className="text-sm text-ink/55">{addr.quartier}{addr.city ? `, ${addr.city}` : ''}</p>
              <p className="text-sm text-ink/55">{addr.phone}</p>
              {addr.instructions && <p className="mt-1 text-xs text-ink/45">{addr.instructions}</p>}
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-2">
              <div className="flex gap-2">
                <button onClick={() => { setEditingId(addr.id); setFormError(''); }} className="rounded-full border border-line p-2 text-ink/50 hover:bg-cream" aria-label="Modifier"><Pencil size={14} /></button>
                <button onClick={() => setDeleteTargetId(addr.id)} className="rounded-full border border-line p-2 text-burgundy/70 hover:bg-burgundy/5" aria-label="Supprimer"><Trash2 size={14} /></button>
              </div>
              {!addr.isDefault && (
                <button onClick={() => void handleSetDefault(addr.id)} disabled={busyId === addr.id} className="text-xs font-medium text-burgundy hover:underline">Définir par défaut</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {adding ? (
        <AddressForm initial={emptyAddressForm} submitting={submitting} error={formError} onCancel={() => { setAdding(false); setFormError(''); }} onSubmit={(input) => void handleAdd(input)} />
      ) : addresses.length > 0 && (
        <button onClick={() => setAdding(true)} className="btn-outline inline-flex items-center gap-1.5"><Plus size={16} /> Ajouter une adresse</button>
      )}

      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTargetId(null)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ink">Supprimer cette adresse ?</h3>
            <p className="mt-2 text-sm text-ink/60">Cette action est irréversible.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteTargetId(null)} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void handleDelete(deleteTargetId)} disabled={busyId === deleteTargetId} className="flex-1 rounded-lg bg-burgundy px-4 py-2.5 text-sm font-medium text-white hover:bg-burgundy/90 disabled:opacity-60">
                {busyId === deleteTargetId ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { orders, favorites, navigate, catalogProducts, customerUser, authLoading, signOutCustomerAccount, updateCustomerAccount, deleteCustomerAccount, changePassword } = useApp();
  const [tab, setTab] = useState<Tab>('orders');
  const [authStep, setAuthStep] = useState<'entry' | 'login' | 'signup'>('entry');
  // orders.status is never updated after creation (see computeDeliveryStepStatus)
  // — this fetches each order's real delivery_missions.status in one batched
  // RPC call (get_order_delivery_statuses) so the badge in the list reflects
  // actual progress, not a frozen value. Previously issued one RPC call per
  // order (N+1) — a customer with a long order history refetched every one
  // of them on every orders-array update, not just the new order.
  const [missionStatuses, setMissionStatuses] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const deliveryOrders = orders.filter((o) => o.supabaseOrderId && o.shopFulfillments.some((f) => f.type === 'delivery'));
    if (deliveryOrders.length === 0) return;
    const supabaseIds = deliveryOrders.map((o) => o.supabaseOrderId!);
    void fetchOrderDeliveryMissionStatuses(supabaseIds).then((statusesBySupabaseId) => {
      const byOrderId: Record<string, string | null> = {};
      for (const o of deliveryOrders) {
        byOrderId[o.id] = statusesBySupabaseId[o.supabaseOrderId!] ?? null;
      }
      setMissionStatuses(byOrderId);
    });
  }, [orders]);
  const [infoForm, setInfoForm] = useState<InfoForm>(() => ({
    firstName: customerUser?.firstName ?? '', lastName: customerUser?.lastName ?? '',
    phone: customerUser?.phone ?? '', email: customerUser?.email ?? '',
    quartier: customerUser?.quartier ?? 'Plateau', landmark: customerUser?.landmark ?? '',
  }));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    setPasswordError(''); setPasswordSaved(false);
    if (!currentPassword) { setPasswordError('Renseignez votre mot de passe actuel.'); return; }
    if (newPassword.length < 8) { setPasswordError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPassword !== confirmNewPassword) { setPasswordError('Les mots de passe ne correspondent pas.'); return; }
    setChangingPassword(true);
    const result = await changePassword(currentPassword, newPassword);
    setChangingPassword(false);
    if (result.error) { setPasswordError(result.error); return; }
    setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2500);
  };
  const [infoSaved, setInfoSaved] = useState(false);
  const [emailConfirmationNotice, setEmailConfirmationNotice] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InfoForm, string>>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [ownedShopName, setOwnedShopName] = useState<string | null>(null);

  const openDeleteConfirm = async () => {
    setDeleteError('');
    setOwnedShopName(null);
    setDeleteConfirmOpen(true);
    const shop = await fetchOwnShopForDeletionWarning();
    if (shop) setOwnedShopName(shop.shopName);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const result = await deleteCustomerAccount();
    setDeleting(false);
    if (result.error) { setDeleteError(result.error); return; }
    navigate('/');
  };

  const navItems: { id: Tab; label: string; icon: typeof ShoppingBag }[] = [
    { id: 'orders', label: 'Mes commandes', icon: ShoppingBag },
    { id: 'favorites', label: 'Mes favoris', icon: Heart },
    { id: 'addresses', label: 'Mes adresses', icon: MapPin },
    { id: 'info', label: 'Mes informations', icon: User },
  ];

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof InfoForm, string>> = {};
    if (!infoForm.firstName.trim()) newErrors.firstName = 'Ce champ est obligatoire.';
    if (!infoForm.lastName.trim()) newErrors.lastName = 'Ce champ est obligatoire.';
    if (!infoForm.phone.trim()) newErrors.phone = 'Ce champ est obligatoire.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveInfo = async () => {
    if (!validate()) return;
    const result = await updateCustomerAccount(infoForm);
    if (!result.error) {
      setInfoSaved(true);
      setEmailConfirmationNotice(Boolean(result.emailConfirmationSent));
      setTimeout(() => setInfoSaved(false), 2000);
    }
  };

  const updateField = (field: keyof InfoForm, value: string) => {
    const next = field === 'firstName' || field === 'lastName' ? capitalizeFirst(value) : value;
    setInfoForm((prev) => ({ ...prev, [field]: next }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  if (authLoading) {
    return <div className="container-pro py-20 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (!customerUser) {
    return (
      <div className="container-pro">
        {authStep === 'entry' ? (
          <AccountEntryPage onChoose={setAuthStep} />
        ) : (
          <CustomerAuthPanel onBack={() => setAuthStep('entry')} initialView={authStep} />
        )}
      </div>
    );
  }

  return (
    <div className="container-pro py-8">
      {/* Profile header */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-burgundy/10 text-burgundy flex-shrink-0"><User size={28} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-ink">{customerUser.firstName} {customerUser.lastName}</h1>
            <p className="text-sm text-ink/55 truncate">{customerUser.email || customerUser.phone}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-semibold text-ink">{orders.length}</p>
            <p className="text-xs text-ink/50">Commande{orders.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-5 border-b border-line mb-6 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-1.5 border-b-2 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${tab === item.id ? 'border-burgundy text-burgundy' : 'border-transparent text-ink/50 hover:text-ink'}`}>
              <Icon size={15} /> {item.label}
            </button>
          );
        })}
      </div>

      {/* === MES COMMANDES === */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingBag size={36} className="text-ink/20" />
              <p className="mt-3 text-sm text-ink/55">Aucune commande pour le moment.</p>
              <button onClick={() => navigate('/')} className="btn-outline mt-4">Découvrir les produits</button>
            </div>
          ) : (
            orders.map((order) => {
              const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
              const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
              const effectiveStatus = computeDeliveryStepStatus(order, missionStatuses[order.id] ?? null);
              return (
                <div key={order.id} className="card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-ink">{order.id}</span>
                      <p className="text-xs text-ink/45 mt-0.5">{new Date(order.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getOrderStatusColor(order, effectiveStatus)}`}>{getOrderStatusLabel(order, effectiveStatus)}</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {order.items.slice(0, 4).map((item, i) => {
                      // A placeholder thumbnail for an archived product beats
                      // silently dropping it from this order's own preview row.
                      const p = catalogProducts.find((cp) => cp.id === item.productId);
                      return <SmartImage key={i} src={p?.thumbnailUrl || p?.images[0] || `${import.meta.env.BASE_URL}ezial-fallback.webp`} alt="" className="h-12 w-10 rounded object-cover flex-shrink-0" />;
                    })}
                    {order.items.length > 4 && <div className="flex h-12 w-10 items-center justify-center rounded bg-cream text-xs text-ink/40">+{order.items.length - 4}</div>}
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <div className="text-sm">
                      <span className="flex items-center gap-1 text-ink/45 mb-0.5">
                        {hasPickup && hasDelivery ? <><Truck size={12} /> Livraison + Retrait</> : hasPickup ? <><Store size={12} /> Retrait en boutique</> : <><Truck size={12} /> Livraison Ezial</>}
                      </span>
                      <span className="text-ink/50">{order.items.length} article{order.items.length > 1 ? 's' : ''} · </span>
                      <span className="font-semibold text-ink">{formatFCFA(order.total)}</span>
                    </div>
                    <button onClick={() => navigate(`/compte/commande/${order.id}`)} className="flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">Voir la commande <ChevronRight size={14} /></button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* === MES FAVORIS === */}
      {tab === 'favorites' && (
        <div>
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Heart size={36} className="text-ink/20" />
              <p className="mt-3 text-sm text-ink/55">Vous n'avez pas encore de favoris.</p>
              <p className="mt-1 text-xs text-ink/40">Touchez le cœur sur un produit pour le retrouver ici.</p>
              <button onClick={() => navigate('/')} className="btn-outline mt-4">Découvrir les produits</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink/55 mb-4">{favorites.length} produit{favorites.length > 1 ? 's' : ''} sauvegardé{favorites.length > 1 ? 's' : ''}</p>
              <ProductGrid products={favorites.map((id) => catalogProducts.find((p) => p.id === id)).filter(Boolean) as typeof catalogProducts} columns={4} />
            </>
          )}
        </div>
      )}

      {/* === MES ADRESSES === */}
      {tab === 'addresses' && <AddressesTab />}

      {/* === MES INFORMATIONS === */}
      {tab === 'info' && (
        <div className="space-y-6">
          <NotificationOptIn userId={customerUser.id} label="Notifications de suivi de commande" />
          <MarketingPushToggle />

          {/* Informations personnelles */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Informations personnelles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label>
                <input className={`input-field ${errors.firstName ? 'border-burgundy/40' : ''}`} value={infoForm.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                {errors.firstName && <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label>
                <input className={`input-field ${errors.lastName ? 'border-burgundy/40' : ''}`} value={infoForm.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                {errors.lastName && <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {errors.lastName}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
              <PhoneField value={infoForm.phone} onChange={(v) => updateField('phone', v)} className={`input-field ${errors.phone ? 'border-burgundy/40' : ''}`} />
              {errors.phone && <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {errors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Email (facultatif)</label>
              <input className="input-field" type="email" value={infoForm.email} onChange={(e) => updateField('email', e.target.value)} />
              <p className="mt-1 text-xs text-ink/40">Changer l'email envoie un lien de confirmation à la nouvelle adresse ; l'ancienne reste active jusqu'à confirmation.</p>
            </div>
          </div>

          {/* Mot de passe */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Mot de passe</h2>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe actuel</label>
              <PasswordField value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Nouveau mot de passe</label>
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder="8 caractères minimum" autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Confirmer le nouveau mot de passe</label>
              <PasswordField value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" />
            </div>
            {passwordError && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {passwordError}</p>}
            <div className="flex items-center gap-3">
              <button onClick={() => void handleChangePassword()} disabled={changingPassword} className="btn-outline">
                {changingPassword ? 'Modification...' : 'Modifier le mot de passe'}
              </button>
              {passwordSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Mot de passe modifié</span>}
            </div>
          </div>

          {/* Adresse */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Adresse</h2>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Quartier</label>
              <select className="input-field" value={infoForm.quartier} onChange={(e) => updateField('quartier', e.target.value)}>
                {quartiers.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse / point de repère</label>
              <textarea className="input-field" rows={2} placeholder="Ex: près de la pharmacie, portail bleu..." value={infoForm.landmark} onChange={(e) => updateField('landmark', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => void handleSaveInfo()} className="btn-primary">Enregistrer</button>
            {infoSaved && !emailConfirmationNotice && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Enregistré</span>}
          </div>
          {infoSaved && emailConfirmationNotice && (
            <p className="flex items-start gap-1.5 text-sm text-green-700"><Check size={15} className="mt-0.5 flex-shrink-0" /> Enregistré. Un email de confirmation a été envoyé à votre nouvelle adresse.</p>
          )}

          {/* Only here now — logout/delete used to show under every tab,
              favorites included. */}
          <div className="border-t border-line pt-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink/40">Gestion du compte</h2>
            <div className="space-y-3">
              <button onClick={() => { signOutCustomerAccount(); navigate('/'); }} className="card w-full p-4 text-left flex items-center gap-3 text-sm font-medium text-ink/70 hover:border-ink/20 transition-colors">
                <LogOut size={18} className="text-ink/40" /> Se déconnecter
              </button>
              <button onClick={() => void openDeleteConfirm()} className="card w-full p-4 text-left flex items-center gap-3 text-sm font-medium text-burgundy hover:border-burgundy/30 transition-colors">
                <Trash2 size={18} /> Supprimer mon compte
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="font-display text-lg font-semibold text-ink">Supprimer votre compte ?</h3>
            <p className="mt-2 text-sm text-ink/60">
              Vos informations personnelles (nom, téléphone, adresse) seront définitivement anonymisées et vous serez déconnecté.
              Vos commandes passées restent conservées pour la comptabilité, sans y être associées nominativement.
              Cette action est irréversible.
            </p>
            {ownedShopName && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                Vous gérez aussi la boutique « {ownedShopName} » avec ce compte. La supprimer retirera aussi définitivement votre accès vendeur à cette boutique.
              </p>
            )}
            {deleteError && <p className="mt-3 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {deleteError}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirmOpen(false)} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void handleDeleteAccount()} disabled={deleting} className="flex-1 rounded-lg bg-burgundy px-4 py-2.5 text-sm font-medium text-white hover:bg-burgundy/90 disabled:opacity-60">
                {deleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
