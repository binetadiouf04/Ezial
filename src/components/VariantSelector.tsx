import type { VariantOption } from '@/data/products';
import { getColor } from '@/data/colors';

function ColorSwatch({ colorName, selected, onClick }: { colorName: string; selected: boolean; onClick: () => void }) {
  const def = getColor(colorName);
  const hex = def?.hex ?? '#ccc';
  const isLight = def?.light ?? false;
  const isMulti = def?.multi ?? false;

  const background = isMulti
    ? 'conic-gradient(from 0deg, #e0507a, #f4d03f, #3bc4d0, #9c5ab8, #1c8a5b, #e0507a)'
    : hex;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={colorName}
      title={colorName}
      aria-pressed={selected}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all ${
        selected
          ? 'ring-2 ring-offset-2 ring-ink'
          : 'ring-1 ring-transparent hover:ring-ink/20'
      }`}
    >
      <span
        className={`h-7 w-7 rounded-full ${isLight ? 'ring-1 ring-ink/15' : ''}`}
        style={{ background }}
      />
    </button>
  );
}

export default function VariantSelector({ variants, selected, onChange }: { variants: VariantOption[]; selected: Record<string, string>; onChange: (name: string, value: string) => void }) {
  return (
    <div className="space-y-4">
      {variants.map((v) => {
        const isColor = v.name.toLowerCase() === 'couleur' || v.name.toLowerCase() === 'finition';

        if (isColor) {
          return (
            <div key={v.name}>
              <div className="mb-2.5 flex items-center gap-1.5">
                <span className="text-sm font-medium text-ink">{v.name}</span>
                <span className="text-ink/40">:</span>
                <span className="text-sm font-medium text-ink/80">{selected[v.name] ?? '—'}</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {v.values.map((val) => (
                  <ColorSwatch
                    key={val}
                    colorName={val}
                    selected={selected[v.name] === val}
                    onClick={() => onChange(v.name, val)}
                  />
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={v.name}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{v.name}</span>
              {selected[v.name] && <span className="text-xs text-ink/50">{selected[v.name]}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {v.values.map((val) => {
                const isActive = selected[v.name] === val;
                return (
                  <button
                    key={val}
                    onClick={() => onChange(v.name, val)}
                    className={`min-w-[44px] rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all ${
                      isActive
                        ? 'border-burgundy bg-burgundy/5 text-burgundy'
                        : 'border-line bg-white text-ink/70 hover:border-ink/30'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
