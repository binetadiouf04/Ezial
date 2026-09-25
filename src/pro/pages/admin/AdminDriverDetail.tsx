import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminDrivers, setAdminDriverSuspended, resetAdminDriverPin, type AdminDriverSummary } from '@/lib/supabaseAdminDrivers';
import { ArrowLeft, Phone, IdCard, Calendar, AlertTriangle, X, Loader2, KeyRound, ShieldOff, ShieldCheck } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AdminDriverDetail({ driverId }: { driverId: string }) {
  const { navigate } = usePro();
  const [driver, setDriver] = useState<AdminDriverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  const [pinResetDone, setPinResetDone] = useState(false);

  // Reuses the list fetch and finds the one row — this screen doesn't need
  // its own dedicated single-driver query, and it keeps the exact same
  // shape/mapping as the list (no drift between the two).
  const load = useCallback(async () => {
    setLoading(true);
    const drivers = await fetchAdminDrivers();
    setDriver(drivers.find((d) => d.id === driverId) ?? null);
    setLoading(false);
  }, [driverId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (!driver) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Livreur introuvable</p>
        <button onClick={() => navigate('/admin/livreurs')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const handleToggleSuspend = async () => {
    setActing(true);
    setActionError('');
    const result = await setAdminDriverSuspended(driver.id, !driver.isSuspended);
    setActing(false);
    if (result.error) { setActionError(result.error); return; }
    setShowSuspend(false);
    void load();
  };

  const handleResetPin = async () => {
    setActing(true);
    setActionError('');
    const result = await resetAdminDriverPin(driver.id);
    setActing(false);
    if (result.error) { setActionError(result.error); return; }
    setShowResetPin(false);
    setPinResetDone(true);
    void load();
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/livreurs')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Livreurs
      </button>

      {/* Header */}
      <div className="card p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
          <span className="font-display text-xl font-semibold text-burgundy">{driver.firstName.charAt(0) || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold text-ink">{driver.firstName} {driver.lastName}</h1>
          <p className="text-xs text-ink/45 font-mono mt-0.5">{driver.username}</p>
        </div>
        {driver.isSuspended ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600">Suspendu</span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-600">Actif</span>
        )}
      </div>

      {actionError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {actionError}
        </p>
      )}

      {pinResetDone && (
        <p className="flex items-start gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" /> NIP réinitialisé — le livreur devra en créer un nouveau à sa prochaine connexion.
        </p>
      )}

      {/* Info */}
      <div className="card divide-y divide-line">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><IdCard size={15} className="text-ink/35" /> Nom d'utilisateur</span>
          <span className="text-sm font-medium text-ink font-mono">{driver.username}</span>
        </div>
        {driver.phone && (
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55 flex items-center gap-2"><Phone size={15} className="text-ink/35" /> Téléphone</span>
            <span className="text-sm font-medium text-ink">{driver.phone}</span>
          </div>
        )}
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Calendar size={15} className="text-ink/35" /> Créé le</span>
          <span className="text-sm font-medium text-ink">{formatDate(driver.createdAt)}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><KeyRound size={15} className="text-ink/35" /> NIP configuré</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${driver.hasPinConfigured ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-700'}`}>
            {driver.hasPinConfigured ? 'Oui' : 'Non — première connexion en attente'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <button onClick={() => setShowResetPin(true)} className="btn-outline w-full flex items-center justify-center gap-2">
          <KeyRound size={16} /> Réinitialiser le NIP
        </button>
        {driver.isSuspended ? (
          <button onClick={() => void handleToggleSuspend()} disabled={acting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
            {acting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Réactiver le livreur
          </button>
        ) : (
          <button onClick={() => setShowSuspend(true)} className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
            <ShieldOff size={16} /> Suspendre
          </button>
        )}
      </div>

      {/* Suspend confirmation */}
      {showSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowSuspend(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Suspendre le livreur</h3>
              <button onClick={() => setShowSuspend(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="flex items-start gap-2 mb-5">
              <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ink/55">Le livreur ne pourra plus se connecter ni accepter de nouvelles missions. Son historique est conservé.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSuspend(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => void handleToggleSuspend()} disabled={acting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-60">
                {acting ? 'Suspension...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN confirmation */}
      {showResetPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowResetPin(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Réinitialiser le NIP</h3>
              <button onClick={() => setShowResetPin(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="flex items-start gap-2 mb-5">
              <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ink/55">L'ancien NIP sera invalidé. Le livreur devra en créer un nouveau à sa prochaine connexion avec son nom d'utilisateur.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowResetPin(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => void handleResetPin()} disabled={acting} className="btn-primary flex-1 disabled:opacity-60">
                {acting ? 'Réinitialisation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
