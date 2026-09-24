import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { Search, CheckCircle2, MapPin, Package } from 'lucide-react';

const PAGE_SIZE = 10;

// No financial data — the driver is paid monthly outside this app. This is
// purely a lookup tool: "did I deliver that order, and when."
export default function DriverHistory() {
  const { navigate, completedMissions } = usePro();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? completedMissions.filter((m) =>
      m.orderId.toLowerCase().includes(normalizedQuery) ||
      m.customerName.toLowerCase().includes(normalizedQuery) ||
      (m.deliveredAt && formatDate(m.deliveredAt).toLowerCase().includes(normalizedQuery)),
    )
    : completedMissions;

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Historique</h1>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          className="input-field pl-9"
          placeholder="Rechercher par référence, client, date..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
        />
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="card p-8 text-center">
            <CheckCircle2 size={28} className="mx-auto text-ink/20" />
            <p className="mt-2 text-sm text-ink/45">Aucune livraison trouvée.</p>
          </div>
        ) : (
          visible.map((m) => (
            <button key={m.id} onClick={() => navigate(`/driver/livraisons/${m.id}`)} className="card w-full p-4 text-left hover:card-shadow transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold text-ink">{m.orderId}</span>
                <span className="text-xs font-medium text-green-600 flex items-center gap-1"><CheckCircle2 size={13} /> Livrée</span>
              </div>
              <p className="text-sm text-ink/65">{m.customerName}</p>
              <div className="mt-2 flex items-center gap-3 border-t border-line pt-2 text-xs text-ink/45">
                <span className="flex items-center gap-1"><MapPin size={12} /> {m.destination}</span>
                <span className="flex items-center gap-1"><Package size={12} /> {m.collections.length} colis</span>
                {m.deliveredAt && <span>{formatDate(m.deliveredAt)}</span>}
              </div>
            </button>
          ))
        )}
      </div>

      {visibleCount < filtered.length && (
        <button onClick={() => setVisibleCount((n) => n + PAGE_SIZE)} className="btn-outline w-full">
          Charger plus
        </button>
      )}
    </div>
  );
}
