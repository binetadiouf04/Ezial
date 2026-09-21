import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { countryDialCodes, DEFAULT_COUNTRY, flagEmoji, type CountryDialCode } from '@/data/countries';

interface PhoneFieldProps {
  /** Clean international format, e.g. "+221771234567", or '' when empty. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function parseValue(value: string): { country: CountryDialCode; local: string } {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1);
    const byLongestCode = [...countryDialCodes].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const match = byLongestCode.find((c) => digits.startsWith(c.dialCode));
    if (match) return { country: match, local: digits.slice(match.dialCode.length) };
  }
  return { country: DEFAULT_COUNTRY, local: trimmed.replace(/\D/g, '') };
}

// Country-code selector + local number input, always emitting a clean
// "+<dialCode><digits>" international value (no spaces, no leading trunk
// zero) — used everywhere a phone number is collected. Sénégal (+221) is
// the default for an empty value, per the app's primary market.
export default function PhoneField({ value, onChange, className = 'input-field' }: PhoneFieldProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const local = parsed.local;
  // The selected country is its own piece of state, not purely derived from
  // `value` — an empty phone number carries no country information at all
  // (onChange('') is indistinguishable from "still no digits"), so deriving
  // it straight from `value` snapped back to Sénégal the instant a country
  // was picked before typing any digit. Only re-sync from `value` when it
  // actually carries a number to read a country from (e.g. an account's
  // saved phone loading in after this field already mounted).
  const [country, setCountry] = useState<CountryDialCode>(parsed.country);
  useEffect(() => {
    if (parsed.local) setCountry(parsed.country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countryDialCodes;
    return countryDialCodes.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q));
  }, [query]);

  const emit = (nextCountry: CountryDialCode, nextLocal: string) => {
    setCountry(nextCountry);
    const digits = nextLocal.replace(/\D/g, '').replace(/^0+/, '');
    onChange(digits ? `+${nextCountry.dialCode}${digits}` : '');
  };

  return (
    <div className="relative flex" ref={wrapRef}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        className="flex items-center gap-1 rounded-l-lg border border-r-0 border-line bg-cream/40 px-3 text-sm text-ink/70 hover:bg-cream flex-shrink-0"
      >
        <span>{flagEmoji(country.iso2)}</span>
        <span className="font-mono">+{country.dialCode}</span>
        <ChevronDown size={14} className="text-ink/40" />
      </button>
      <input
        type="tel"
        inputMode="numeric"
        value={local}
        onChange={(e) => emit(country, e.target.value)}
        className={`${className} rounded-l-none min-w-0 flex-1`}
        placeholder="77 123 45 67"
      />
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-line bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="text-ink/35 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un pays..."
              className="w-full text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => { emit(c, local); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream"
              >
                <span>{flagEmoji(c.iso2)}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono text-ink/45">+{c.dialCode}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-3 text-center text-xs text-ink/40">Aucun pays trouvé.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
