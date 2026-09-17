import { useState } from 'react';
import { useApp, type DeliveryStepStatus, type PickupStepStatus, type Order, quartiers } from '@/store/AppContext';
import { deliveryStatusLabels, pickupStepLabels } from '@/data/orderStatusLabels';
import { formatFCFA } from '@/data/products';
import ProductGrid from '@/components/ProductGrid';
import SmartImage from '@/components/SmartImage';
import NotificationOptIn from '@/components/NotificationOptIn';
import { User, Heart, ShoppingBag, LogOut, ChevronRight, Briefcase, Truck, Store, Check, AlertCircle, Loader2 } from 'lucide-react';

const deliveryStatusColors: Record<DeliveryStepStatus, string> = {
  confirmed: 'bg-blue-50 text-blue-700', preparing: 'bg-amber-50 text-amber-700', ready: 'bg-green-50 text-green-700',
  picked_up: 'bg-blue-50 text-blue-700', delivering: 'bg-blue-50 text-blue-700', delivered: 'bg-ink/5 text-ink/60',
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
    return pickupStepLabels[worst] ?? pickupStepLabels.preparing;
  }
  return deliveryStatusLabels[order.status] ?? deliveryStatusLabels.confirmed;
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
type AuthView = 'login' | 'signup' | 'forgot';

interface InfoForm { firstName: string; lastName: string; phone: string; email: string; quartier: string; landmark: string }

// === Signed-out: login / signup / forgot password ===
function AuthPanel() {
  const { signInCustomerAccount, signUpCustomerAccount, requestPasswordReset } = useApp();
  const [view, setView] = useState<AuthView>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');

  const switchView = (v: AuthView) => { setView(v); setError(''); setNotice(''); };

  const handleLogin = async () => {
    setError(''); setNotice('');
    if (!loginId.trim() || !loginPassword) { setError('Renseignez votre identifiant et votre mot de passe.'); return; }
    setSubmitting(true);
    const result = await signInCustomerAccount(loginId.trim(), loginPassword);
    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  const handleSignup = async () => {
    setError(''); setNotice('');
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom sont obligatoires.'); return; }
    if (!phone.trim() && !email.trim()) { setError('Renseignez un email ou un numéro de téléphone.'); return; }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setSubmitting(true);
    const result = await signUpCustomerAccount({ firstName, lastName, phone: phone.trim() || undefined, email: email.trim() || undefined, password });
    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  const handleReset = async () => {
    setError(''); setNotice('');
    if (!resetEmail.trim()) { setError('Renseignez votre email.'); return; }
    setSubmitting(true);
    const result = await requestPasswordReset(resetEmail.trim());
    setSubmitting(false);
    if (result.error) setError(result.error);
    else setNotice('Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.');
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><User size={26} /></div>
        <h1 className="font-display text-xl font-semibold text-ink">Mon compte</h1>
        <p className="mt-1 text-sm text-ink/55">Connectez-vous ou créez un compte pour suivre vos commandes.</p>
      </div>

      {view !== 'forgot' && (
        <div className="mb-5 flex rounded-full border border-line p-1">
          <button onClick={() => switchView('login')} className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${view === 'login' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>Se connecter</button>
          <button onClick={() => switchView('signup')} className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${view === 'signup' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>S'inscrire</button>
        </div>
      )}

      {error && <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      {notice && <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700"><Check size={15} className="mt-0.5 flex-shrink-0" /> {notice}</p>}

      {view === 'login' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Email ou téléphone</label>
            <input className="input-field" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label>
            <input type="password" className="input-field" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </div>
          <button onClick={() => void handleLogin()} disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Connexion...</> : 'Se connecter'}
          </button>
          <button onClick={() => switchView('forgot')} className="w-full text-center text-xs font-medium text-burgundy hover:underline">Mot de passe oublié ?</button>
        </div>
      )}

      {view === 'signup' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label><input className="input-field" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label><input className="input-field" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label><input className="input-field" placeholder="+221 ..." value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email {phone.trim() ? '(optionnel)' : ''}</label><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <p className="text-[11px] text-ink/40">Téléphone ou email obligatoire (au moins l'un des deux). Un email permet de récupérer votre mot de passe en cas d'oubli.</p>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label><input type="password" className="input-field" placeholder="8 caractères minimum" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button onClick={() => void handleSignup()} disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Créer mon compte'}
          </button>
        </div>
      )}

      {view === 'forgot' && (
        <div className="space-y-4">
          <p className="text-xs text-ink/50">Fonctionne uniquement si un email a été renseigné sur le compte.</p>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label><input type="email" className="input-field" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /></div>
          <button onClick={() => void handleReset()} disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Envoi...</> : 'Envoyer le lien de réinitialisation'}
          </button>
          <button onClick={() => switchView('login')} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Retour à la connexion</button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { orders, favorites, navigate, catalogProducts, customerUser, authLoading, signOutCustomerAccount, updateCustomerAccount } = useApp();
  const [tab, setTab] = useState<Tab>('orders');
  const [infoForm, setInfoForm] = useState<InfoForm>(() => ({
    firstName: customerUser?.firstName ?? '', lastName: customerUser?.lastName ?? '',
    phone: customerUser?.phone ?? '', email: customerUser?.email ?? '',
    quartier: customerUser?.quartier ?? 'Plateau', landmark: customerUser?.landmark ?? '',
  }));
  const [infoSaved, setInfoSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InfoForm, string>>>({});

  const navItems: { id: Tab; label: string; icon: typeof ShoppingBag }[] = [
    { id: 'orders', label: 'Mes commandes', icon: ShoppingBag },
    { id: 'favorites', label: 'Mes favoris', icon: Heart },
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
    if (!result.error) { setInfoSaved(true); setTimeout(() => setInfoSaved(false), 2000); }
  };

  const updateField = (field: keyof InfoForm, value: string) => {
    setInfoForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  if (authLoading) {
    return <div className="container-pro py-20 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (!customerUser) {
    return (
      <div className="container-pro">
        <AuthPanel />
        <div className="mx-auto mb-10 max-w-sm border-t border-line pt-8 text-center">
          <button onClick={() => navigate('/pro')} className="btn-outline inline-flex"><Briefcase size={16} /> Accéder à Ezial Pro</button>
        </div>
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
                      const p = catalogProducts.find((cp) => cp.id === item.productId);
                      if (!p) return null;
                      return <SmartImage key={i} src={p.images[0]} alt="" className="h-12 w-10 rounded object-cover flex-shrink-0" />;
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

      {/* === MES INFORMATIONS === */}
      {tab === 'info' && (
        <div className="space-y-6">
          <NotificationOptIn userId={customerUser.id} label="Notifications de suivi de commande" />

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
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => void handleSaveInfo()} className="btn-primary">Enregistrer</button>
            {infoSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Enregistré</span>}
          </div>
        </div>
      )}

      {/* Déconnexion */}
      <div className="mt-6">
        <button onClick={() => { signOutCustomerAccount(); navigate('/'); }} className="card w-full p-4 text-left flex items-center gap-3 text-sm font-medium text-ink/70 hover:border-ink/20 transition-colors">
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
