import { useState } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import type { FilterGroup } from '@/data/filters';

export type SelectedFilters = Record<string, string[]>;

const COLLAPSE_THRESHOLD = 8;

export function FilterPanel({ filters, selected, onChange, onClear }: { filters: FilterGroup[]; selected: SelectedFilters; onChange: (next: SelectedFilters) => void; onClear: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));
  const toggleOption = (group: string, opt: string) => { const current = selected[group] ?? []; const next = current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt]; onChange({ ...selected, [group]: next }); };
  const activeCount = Object.values(selected).reduce((s, arr) => s + (arr?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Filtrer</h3>
        {activeCount > 0 && <button onClick={onClear} className="text-xs font-medium text-burgundy hover:underline">Réinitialiser ({activeCount})</button>}
      </div>
      {filters.map((group) => {
        const isOpen = open[group.id] ?? true;
        const isExpanded = expanded[group.id] ?? !group.collapsible;
        const showToggle = group.collapsible && group.options.length > COLLAPSE_THRESHOLD;
        const visibleOptions = isExpanded ? group.options : group.options.slice(0, COLLAPSE_THRESHOLD);
        return (
          <div key={group.id} className="border-b border-line pb-4">
            <button onClick={() => toggle(group.id)} className="flex w-full items-center justify-between py-1"><span className="text-[13px] font-medium text-ink">{group.label}</span><ChevronDown size={16} className={`text-ink/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
            {isOpen && (
              <div className="mt-2.5 space-y-2">
                {visibleOptions.map((opt) => { const checked = selected[group.id]?.includes(opt); return (
                  <button key={opt} onClick={() => toggleOption(group.id, opt)} className="flex w-full items-center gap-2.5 text-left">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${checked ? 'border-burgundy bg-burgundy' : 'border-line bg-white'}`}>{checked && <Check size={11} className="text-white" strokeWidth={3} />}</span>
                    <span className={`text-[13px] ${checked ? 'text-burgundy font-medium' : 'text-ink/70'}`}>{opt}</span>
                  </button>
                ); })}
                {showToggle && (
                  <button onClick={() => setExpanded((p) => ({ ...p, [group.id]: !isExpanded }))} className="text-xs font-medium text-burgundy hover:underline pt-1">
                    {isExpanded ? 'Voir moins' : 'Voir plus'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FilterDrawer({ open, onClose, filters, selected, onChange, onClear }: { open: boolean; onClose: () => void; filters: FilterGroup[]; selected: SelectedFilters; onChange: (next: SelectedFilters) => void; onClear: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-ink/30 fade-in" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl bg-white flex flex-col slide-up">
        <div className="flex items-center justify-between border-b border-line px-4 py-4"><h3 className="font-display text-base font-semibold">Filtres</h3><button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-cream"><X size={20} /></button></div>
        <div className="flex-1 overflow-y-auto px-4 py-4"><FilterPanel filters={filters} selected={selected} onChange={onChange} onClear={onClear} /></div>
        <div className="border-t border-line p-4"><button onClick={onClose} className="btn-primary w-full">Voir les résultats</button></div>
      </div>
    </div>
  );
}
