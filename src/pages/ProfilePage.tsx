import { useState } from 'react';
import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order, type CustomerInfo, quartiers } from '@/store/AppContext';
import { getProduct, formatFCFA } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import { products } from '@/data/products';
import { User, Heart, ShoppingBag, LogOut, ChevronRight, Briefcase, Truck, Store, Check, AlertCircle } from 'lucide-react';

const deliveryStatusLabels: Record<DeliveryStepStatus, string> = {
  confirmed: 'Commande confirmée', preparing: 'En préparation', ready: 'Prête',
  picked_up: 'En livraison', delivering: 'En livraison', delivered: 'Livrée',
};
const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-blue-50 text-blue-700', delivering: 'bg-blue-50 text-blue-700', delivered: 'bg-ink/5 text-ink/60',
};
const pickupStepLabels: Record<PickupStepStatus, string> = {
  preparing: 'En préparation', ready_for_pickup: 'Prête à récupérer', picked_up: 'Récupérée',
};
const pickupStepColors: Record<PickupStepStatus, string> = {
  preparing: 'bg-amber-50 text-amber-700', ready_for_pickup: 'bg-green-50 text-green-700', picked_up: 'bg-ink/5 text-ink/60',
};

function getOrderStatusLabel(order: Order): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepLabels).indexOf(a) - Object.keys(pickupStepLabels).indexOf(b))[0];
    return pickupStepLabels[worst] ?? 'En préparation';
  }
  return deliveryStatusLabels[order.status] ?? 'Commande confirmée';
}

function getOrderStatusColor(order: Order): string {
  const hasPickup = order.shopFulfillments.some((f) => f.type === 'pickup');
  const hasDelivery = order.shopFulfillments.some((f) => f.type === 'delivery');
  if (hasPickup && !hasDelivery) {
    const pickupStatuses = order.shopFulfillments.filter((f) => f.type === 'pickup').map((f) => f.pickupStatus ?? 'preparing');
    const worst = pickupStatuses.sort((a, b) => Object.keys(pickupStepColors).indexOf(a) - Object.keys(pickupStepColors).indexOf(b))[0];
    return pickupStepColors[worst] ?? deliveryStatusColors.confirmed;
  }
  return deliveryStatusColors[order.status] ?? deliveryStatusColors.confirmed;
}

type Tab = 'orders' | 'favorites' | 'info';

const requiredFields: (keyof CustomerInfo)[] = ['firstName', 'lastName', 'phone'];

export default function ProfilePage() {
  const { orders, favorites, navigate, customerInfo, updateCustomerInfo } = useApp();
  const [tab, setTab] = useState<Tab>('orders');
  const [infoForm, setInfoForm] = useState<CustomerInfo>(customerInfo);
  const [infoSaved, setInfoSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerInfo, string>>>({});

  const navItems: { id: Tab; label: string; icon: typeof ShoppingBag }[] = [
    { id: 'orders', label: 'Mes commandes', icon: ShoppingBag },
    { id: 'favorites', label: 'Mes favoris', icon: Heart },
    { id: 'info', label: 'Mes informations', icon: User },
  ];

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CustomerInfo, string>> = {};
    for (const field of requiredFields) {
      if (!infoForm[field].trim()) {
        newErrors[field] = 'Ce champ est obligatoire.';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveInfo = () => {
    if (!validate()) return;
    updateCustomerInfo(infoForm);
    setInfoSaved(true);
    setTimeout(() => setInfoSaved(false), 2000);
  };

  const updateField = (field: keyof CustomerInfo, value: string) => {
    setInfoForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="container-pro py-8">
      {/* Profile header */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-burgundy/10 text-burgundy flex-shrink-0"><User size={28} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-ink">{customerInfo.firstName} {customerInfo.lastName}</h1>
            <p className="text-sm text-ink/55 truncate">{customerInfo.email || customerInfo.phone}</p>
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
              return (
                <div key={order.id} className="card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-ink">{order.id}</span>
                      <p className="text-xs text-ink/45 mt-0.5">{new Date(order.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getOrderStatusColor(order)}`}>{getOrderStatusLabel(order)}</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {order.items.slice(0, 4).map((item, i) => {
                      const p = getProduct(item.productId);
                      if (!p) return null;
                      return <img key={i} src={p.images[0]} alt="" className="h-12 w-10 rounded object-cover" />;
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
              <ProductGrid products={favorites.map((id) => getProduct(id)).filter(Boolean) as typeof products} columns={4} />
            </>
          )}
        </div>
      )}

      {/* === MES INFORMATIONS === */}
      {tab === 'info' && (
        <div className="space-y-6">
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
              <input className={`input-field ${errors.phone ? 'border-burgundy/40' : ''}`} placeholder="+221 ..." value={infoForm.phone} onChange={(e) => updateField('phone', e.target.value)} />
              {errors.phone && <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><AlertCircle size={11} /> {errors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Email (facultatif)</label>
              <input className="input-field" type="email" value={infoForm.email} onChange={(e) => updateField('email', e.target.value)} />
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
            <div className="flex items-center gap-2 text-sm text-ink/40">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream text-ink/30"><User size={15} /></span>
              <span className="text-xs">Position sur la carte — disponible prochainement</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveInfo} className="btn-primary">Enregistrer</button>
            {infoSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Enregistré</span>}
          </div>
        </div>
      )}

      {/* Déconnexion */}
      <div className="mt-6">
        <button className="card w-full p-4 text-left flex items-center gap-3 text-sm font-medium text-ink/70 hover:border-ink/20 transition-colors">
          <LogOut size={18} className="text-ink/40" /> Se déconnecter
        </button>
      </div>

      {/* EZIAL PRO access section */}
      <div className="mt-10 border-t border-line pt-8">
        <div className="rounded-xl border border-line bg-cream/40 p-6 text-center sm:p-8">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-burgundy/10 text-burgundy"><Briefcase size={20} /></div>
          <h2 className="font-display text-lg font-semibold text-ink">Vous êtes partenaire Ezial ?</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink/55">Accédez à votre espace de gestion : administration, boutique vendeur ou missions de livraison.</p>
          <button onClick={() => navigate('/pro')} className="btn-outline mt-5 inline-flex">
            <Briefcase size={16} /> Accéder à Ezial Pro
          </button>
        </div>
      </div>
    </div>
  );
}
