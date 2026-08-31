import { AlertTriangle } from 'lucide-react';
import type { ModerationEntry } from '../data';

const titles: Partial<Record<ModerationEntry['action'], string>> = {
  refused: 'PRODUIT À CORRIGER',
  flagged: 'SIGNALÉ PAR EZIAL',
  deactivated: 'DÉSACTIVÉ PAR EZIAL',
  suspended: 'SUSPENDU PAR EZIAL',
};

/**
 * Vendor-facing notice built from the latest moderation entry. Only ever
 * reads `reason` and `vendorMessage` — `internalNote` must never be passed
 * to or rendered by this component.
 */
export default function VendorNoticeBanner({ entry }: { entry: ModerationEntry | null }) {
  if (!entry || (entry.action !== 'refused' && entry.action !== 'flagged' && entry.action !== 'deactivated' && entry.action !== 'suspended')) {
    return null;
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-700">
        <AlertTriangle size={14} /> {titles[entry.action]}
      </p>
      {entry.reason && (
        <div>
          <p className="text-[11px] font-medium text-orange-600/80">Raison</p>
          <p className="text-sm text-orange-800">{entry.reason}</p>
        </div>
      )}
      {entry.vendorMessage && (
        <div>
          <p className="text-[11px] font-medium text-orange-600/80">Message Ezial</p>
          <p className="text-sm text-orange-800">« {entry.vendorMessage} »</p>
        </div>
      )}
    </div>
  );
}
