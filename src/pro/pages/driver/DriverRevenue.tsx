import { usePro } from '../../ProContext';
import { formatFCFA, formatDate, driverTransactions } from '../../data';
import { Wallet, TrendingUp, CheckCircle2 } from 'lucide-react';

export default function DriverRevenue() {
  const { completedMissions } = usePro();

  // Combine mock driver transactions with any completed missions from this session
  const allEarnings = [
    ...driverTransactions
      .filter((t) => t.status === 'delivered')
      .map((t) => ({ id: t.missionId, date: t.date, earnings: t.earnings })),
    ...completedMissions
      .filter((m) => m.deliveredAt && m.step === 'delivered')
      .map((m) => ({
        id: m.orderId,
        date: m.deliveredAt!.split('T')[0],
        earnings: m.earnings,
      })),
  ];

  const baseWeekly = 47250;
  const sessionEarnings = completedMissions
    .filter((m) => m.deliveredAt)
    .reduce((sum, m) => sum + m.earnings, 0);
  const weeklyEarnings = baseWeekly + sessionEarnings;
  const yearlyEarnings = 472500 + sessionEarnings;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Revenus</h1>

      {/* Weekly balance — prominent */}
      <div className="card p-6 bg-burgundy text-white border-burgundy">
        <p className="text-xs font-medium text-white/70 flex items-center gap-1.5"><Wallet size={14} /> Solde cette semaine</p>
        <p className="mt-2 font-display text-3xl font-bold">{formatFCFA(weeklyEarnings)}</p>
      </div>

      {/* Yearly */}
      <div className="card p-4">
        <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><TrendingUp size={14} /> Solde cette année</p>
        <p className="mt-1.5 font-display text-xl font-semibold text-ink">{formatFCFA(yearlyEarnings)}</p>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Historique</h2>
        <div className="card divide-y divide-line">
          {allEarnings.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune livraison terminée</p>
          ) : (
            allEarnings.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 bg-green-50">
                  <CheckCircle2 size={18} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-semibold text-ink">{entry.id}</p>
                  <p className="text-xs text-ink/45">{formatDate(entry.date)}</p>
                </div>
                <span className="text-sm font-semibold text-ink flex-shrink-0">
                  +{formatFCFA(entry.earnings)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
