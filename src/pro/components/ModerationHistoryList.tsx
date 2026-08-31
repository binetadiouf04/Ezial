import { History, Lock } from 'lucide-react';
import { moderationActionLabels, type ModerationEntry } from '../data';
import { formatDateTime } from '../data';

export default function ModerationHistoryList({ entries }: { entries: ModerationEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card p-6 text-center">
        <History size={22} className="mx-auto text-ink/20" />
        <p className="mt-2 text-sm text-ink/45">Aucune action de modération pour l'instant.</p>
      </div>
    );
  }

  return (
    <div className="card divide-y divide-line">
      {entries.map((entry) => (
        <div key={entry.id} className="p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-ink">{moderationActionLabels[entry.action]}</p>
            <p className="text-xs text-ink/40">{formatDateTime(entry.date)}</p>
          </div>
          {entry.reason && <p className="text-xs text-ink/60">Raison : <span className="font-medium text-ink/80">{entry.reason}</span></p>}
          {entry.vendorMessage && (
            <p className="text-xs text-ink/60">Message vendeur : <span className="italic text-ink/75">« {entry.vendorMessage} »</span></p>
          )}
          {entry.internalNote && (
            <p className="flex items-start gap-1 text-xs text-ink/50">
              <Lock size={11} className="mt-0.5 flex-shrink-0" />
              <span>Note interne : {entry.internalNote}</span>
            </p>
          )}
          <p className="text-[11px] text-ink/35">Par {entry.adminName}</p>
        </div>
      ))}
    </div>
  );
}
