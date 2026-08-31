import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { User, Phone, IdCard, CheckCircle2, Calendar, Truck } from 'lucide-react';

export default function DriverProfile() {
  const { name, identifier, completedMissions } = usePro();

  const profileData = {
    firstName: name,
    lastName: '',
    phone: '+221 77 200 11 22',
    identifier,
    status: 'on_delivery',
    totalDeliveries: 68,
    joinDate: '2026-02-01',
  };

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
            <p className="font-display text-lg font-semibold text-ink">{profileData.firstName}</p>
            <p className="text-sm text-ink/50 flex items-center gap-1.5">
              <IdCard size={13} className="text-ink/35" />
              <span className="font-mono">{profileData.identifier}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Info list */}
      <div className="card divide-y divide-line">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Phone size={15} className="text-ink/35" /> Téléphone</span>
          <span className="text-sm font-medium text-ink">{profileData.phone}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Truck size={15} className="text-ink/35" /> Statut</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${profileData.status === 'on_delivery' ? 'bg-burgundy/10 text-burgundy' : 'bg-green-50 text-green-600'}`}>
            {profileData.status === 'on_delivery' ? 'En livraison' : 'Disponible'}
          </span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><CheckCircle2 size={15} className="text-ink/35" /> Livraisons totales</span>
          <span className="text-sm font-semibold text-ink">{profileData.totalDeliveries + completedMissions.length}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Calendar size={15} className="text-ink/35" /> Membre depuis</span>
          <span className="text-sm font-medium text-ink">févr. 2026</span>
        </div>
      </div>

      {/* Earnings summary */}
      <div className="card p-4">
        <p className="text-xs text-ink/45">Revenus annuels</p>
        <p className="mt-1 font-display text-xl font-semibold text-ink">{formatFCFA(680000)}</p>
      </div>

      {/* Non-editable note */}
      <p className="text-xs text-ink/35 text-center px-4">
        Votre identifiant et vos informations financières sont gérés par Ezial.
      </p>
    </div>
  );
}
