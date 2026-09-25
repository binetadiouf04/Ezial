import { useState, useEffect } from 'react';
import { usePro } from '../../ProContext';
import { fetchOwnDriverProfile, type OwnDriverProfile } from '@/lib/supabaseDriverAuth';
import { User, Phone, IdCard, CheckCircle2, Calendar, Loader2 } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Real profile only — no mocked phone/status/join date, no financial data,
// and the technical internal auth email is never fetched or shown here.
export default function DriverProfile() {
  const { completedMissions } = usePro();
  const [profile, setProfile] = useState<OwnDriverProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchOwnDriverProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Profil introuvable.</p>
      </div>
    );
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Livreur EZIAL';

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Profil</h1>

      {/* Profile header */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
            <User size={28} className="text-burgundy" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink">{fullName}</p>
            <p className="text-sm text-ink/50 flex items-center gap-1.5">
              <IdCard size={13} className="text-ink/35" />
              <span className="font-mono">{profile.username}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Info list */}
      <div className="card divide-y divide-line">
        {profile.phone && (
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55 flex items-center gap-2"><Phone size={15} className="text-ink/35" /> Téléphone</span>
            <span className="text-sm font-medium text-ink">{profile.phone}</span>
          </div>
        )}
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><CheckCircle2 size={15} className="text-ink/35" /> Livraisons terminées</span>
          <span className="text-sm font-semibold text-ink">{completedMissions.length}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Calendar size={15} className="text-ink/35" /> Membre depuis</span>
          <span className="text-sm font-medium text-ink">{formatDate(profile.createdAt)}</span>
        </div>
      </div>

      {/* Non-editable note */}
      <p className="text-xs text-ink/35 text-center px-4">
        Votre identifiant est géré par Ezial.
      </p>
    </div>
  );
}
