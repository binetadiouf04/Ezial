import { X } from 'lucide-react';
import { categories, categoryMap, type CategoryId } from '@/data/categories';
import { BLOG_LIMITS } from '@/lib/supabaseAdminBlog';

// Links from an article to marketplace categories ('beaute') or
// subcategories ('beaute/skincare'), chosen among src/data/categories.ts.
function labelFor(value: string): string | null {
  const [catId, subId] = value.split('/');
  const cat = categoryMap[catId as CategoryId];
  if (!cat) return null;
  if (!subId) return cat.label;
  const sub = cat.subcategories.find((s) => s.id === subId);
  return sub ? `${cat.label} › ${sub.label}` : null;
}

export default function MarketplaceLinksPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const max = BLOG_LIMITS.marketplaceLinks;
  const full = value.length >= max;
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!full) onChange([...value, v]);
  };
  const unknown = value.filter((v) => !labelFor(v));

  const chip = (v: string, label: string, main = false) => {
    const active = value.includes(v);
    return (
      <button
        key={v}
        type="button"
        onClick={() => toggle(v)}
        disabled={!active && full}
        aria-pressed={active}
        className={`chip ${main ? 'font-semibold' : ''} ${active ? 'chip-active' : `hover:border-ink/30 ${main ? 'text-ink' : ''}`} disabled:opacity-40`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-burgundy/10 px-3 py-1 text-xs font-medium text-burgundy">
              {labelFor(v) ?? `Lien inconnu : ${v}`}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Retirer ce lien"><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {unknown.length > 0 && <p className="text-xs text-burgundy">Un lien ne correspond plus à une catégorie de la marketplace : retirez-le.</p>}
      <div className="space-y-3">
        {categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            {chip(c.id, c.label, true)}
            {c.subcategories.map((s) => chip(`${c.id}/${s.id}`, s.label))}
          </div>
        ))}
      </div>
      <p className="text-xs text-ink/40">{value.length} / {max} liens{full ? ' — maximum atteint' : ''}</p>
    </div>
  );
}
