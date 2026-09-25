import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminDrivers, createAdminDriver, type AdminDriverSummary } from '@/lib/supabaseAdminDrivers';
import { Search, Plus, X, Check, User, Loader2, AlertCircle } from 'lucide-react';

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminDrivers() {
  const { navigate } = usePro();
  const [drivers, setDrivers] = useState<AdminDriverSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [createdDriver, setCreatedDriver] = useState<{ name: string; username: string } | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setDrivers(await fetchAdminDrivers());
    } catch {
      setLoadError('Impossible de charger les livreurs. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = drivers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) || d.username.toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!form.firstName.trim()) { setFormError('Le prénom est obligatoire.'); return; }
    if (!USERNAME_PATTERN.test(form.username.trim())) {
      setFormError("Nom d'utilisateur invalide (4 à 32 caractères : lettres, chiffres, points, tirets ou underscores, sans espace).");
      return;
    }
    setFormError('');
    setCreating(true);
    const result = await createAdminDriver({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      username: form.username.trim(),
      phone: form.phone.trim() || undefined,
    });
    setCreating(false);
    if ('error' in result) { setFormError(result.error); return; }
    setCreatedDriver({ name: `${result.firstName} ${result.lastName}`.trim(), username: result.username });
    setForm({ firstName: '', lastName: '', username: '', phone: '' });
    setShowAdd(false);
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Livreurs</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> <span className="hidden sm:inline">Ajouter un livreur</span>
        </button>
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input className="input-field pl-9" placeholder="Rechercher (nom, nom d'utilisateur)" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun livreur trouvé.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((driver) => (
            <button key={driver.id} onClick={() => navigate(`/admin/livreurs/${driver.id}`)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
              <div className="h-12 w-12 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-burgundy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{driver.firstName} {driver.lastName}</p>
                <p className="text-xs text-ink/45 font-mono mt-0.5">{driver.username}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-ink/45">
                  {driver.phone && <span>{driver.phone}</span>}
                  <span>Créé le {formatDate(driver.createdAt)}</span>
                </div>
              </div>
              {driver.isSuspended ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Suspendu</span>
              ) : !driver.hasPinConfigured ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">NIP non configuré</span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-600">Actif</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Creation success */}
      {createdDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setCreatedDriver(null)}>
          <div className="card max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Livreur ajouté</h3>
            <p className="mt-1 text-sm text-ink/55">{createdDriver.name}</p>
            <div className="mt-4 rounded-lg bg-cream p-3">
              <p className="text-xs text-ink/45">Nom d'utilisateur</p>
              <p className="font-mono text-sm font-semibold text-burgundy mt-0.5">{createdDriver.username}</p>
            </div>
            <p className="mt-3 text-xs text-ink/45">Communiquez ce nom d'utilisateur au livreur — il créera son NIP à sa première connexion.</p>
            <button onClick={() => setCreatedDriver(null)} className="btn-primary w-full mt-5">Fermer</button>
          </div>
        </div>
      )}

      {/* Add driver modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-ink">Nouveau livreur</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label>
                  <input className="input-field" value={form.firstName} onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setFormError(''); }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label>
                  <input className="input-field" value={form.lastName} onChange={(e) => { setForm({ ...form, lastName: e.target.value }); setFormError(''); }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom d'utilisateur</label>
                <input className="input-field font-mono" placeholder="moussa01" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setFormError(''); }} />
                <p className="mt-1 text-[11px] text-ink/40">4 à 32 caractères, sans espace. Le livreur l'utilisera pour se connecter.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone (recommandé)</label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+221 ..." />
              </div>
            </div>
            {formError && <p className="mt-3 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {formError}</p>}
            <button onClick={() => void handleCreate()} disabled={creating} className="btn-primary w-full mt-5 flex items-center justify-center gap-2 disabled:opacity-60">
              {creating ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Ajouter le livreur'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
