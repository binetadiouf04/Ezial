import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Loader2, Search, X, Info, Zap, Plus } from 'lucide-react';
import { categories } from '@/data/categories';
import {
  saveAdminPromotion, setAdminPromotionStatus, searchActiveProducts, fetchProductsByIds,
  dakarInputsToIso, isoToDakarInputs, KIND_LABELS,
  type AdminPromotion, type AdminShopOption, type ProductOption,
  type PromotionAudience, type PromotionKind, type PromotionTarget, type SellerShareType,
} from '@/lib/supabaseAdminPromotions';

// Formulaire de création / modification d'une campagne. Validation côté
// interface pour guider l'administratrice ; le serveur (admin_promotion_save)
// revalide tout.

interface FormState {
  name: string;
  code: string;
  kind: PromotionKind;
  value: string;
  maxDiscount: string;
  minAmount: string;
  deliveryCap: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  audience: PromotionAudience;
  maxUsesTotal: string;
  maxUsesPerCustomer: string;
  budgetMax: string;
  shopIds: string[];
  categoryIds: string[];
  subcategoryRefs: string[];
  products: ProductOption[];
  shares: ShareState[];
}

interface ShareState {
  shopId: string;
  shareType: SellerShareType;
  shareValue: string;
  agreedNote: string;
  agreed: boolean;
}

// Clés fixes, plus « share:<shopId> » pour chaque part vendeur.
type Errors = Partial<Record<string, string>>;

const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

function str(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}
function digits(s: string): string {
  return s.replace(/[^\d]/g, '');
}
function intOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

function initialState(p: AdminPromotion | null): FormState {
  const start = isoToDakarInputs(p?.startsAt);
  const end = isoToDakarInputs(p?.endsAt);
  const t = p?.targets ?? [];
  return {
    name: p?.name ?? '',
    code: p?.code ?? '',
    kind: p?.kind ?? 'percent',
    value: p && p.kind !== 'free_delivery' ? str(p.value) : '',
    maxDiscount: str(p?.maxDiscount),
    minAmount: p && p.minAmount > 0 ? str(p.minAmount) : '',
    deliveryCap: str(p?.deliveryCap),
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    audience: p?.audience ?? 'all',
    maxUsesTotal: str(p?.maxUsesTotal),
    maxUsesPerCustomer: str(p?.maxUsesPerCustomer ?? 1),
    budgetMax: str(p?.budgetMax),
    shopIds: t.filter((x) => x.type === 'shop').map((x) => x.ref),
    categoryIds: t.filter((x) => x.type === 'category').map((x) => x.ref),
    subcategoryRefs: t.filter((x) => x.type === 'subcategory').map((x) => x.ref),
    products: t.filter((x) => x.type === 'product').map((x) => ({ id: x.ref, name: '…', shopId: '' })),
    // Une part déjà enregistrée a été acceptée par le vendeur.
    shares: (p?.sellerShares ?? []).map((x) => ({ shopId: x.shopId, shareType: x.shareType, shareValue: str(x.shareValue), agreedNote: x.agreedNote ?? '', agreed: true })),
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Donnez un nom à la campagne.';
  else if (f.name.trim().length > 80) e.name = '80 caractères au maximum.';
  if (f.code && !CODE_RE.test(f.code)) e.code = 'De 3 à 30 caractères : lettres, chiffres, « - » ou « _ ».';
  if (f.kind === 'fixed') {
    if (!f.value || Number(f.value) <= 0) e.value = 'Indiquez un montant en FCFA.';
  } else if (f.kind === 'percent') {
    const v = Number(f.value);
    if (!f.value || v <= 0 || v > 100) e.value = 'Indiquez un pourcentage entre 1 et 100.';
    if (f.maxDiscount && Number(f.maxDiscount) <= 0) e.maxDiscount = 'Le plafond doit être positif.';
  } else if (f.deliveryCap && Number(f.deliveryCap) <= 0) {
    e.deliveryCap = 'Le plafond doit être positif.';
  }
  const start = dakarInputsToIso(f.startDate, f.startTime);
  const end = dakarInputsToIso(f.endDate, f.endTime);
  if (!start) e.start = 'Choisissez la date et l’heure de début.';
  if (!end) e.end = 'Choisissez la date et l’heure de fin.';
  else if (start && new Date(end) <= new Date(start)) e.end = 'La fin doit être après le début.';
  if (f.maxUsesTotal && Number(f.maxUsesTotal) < 1) e.maxUsesTotal = 'Au moins 1 utilisation.';
  if (!f.maxUsesPerCustomer || Number(f.maxUsesPerCustomer) < 1) e.maxUsesPerCustomer = 'Au moins 1 utilisation par client.';
  if (f.budgetMax && Number(f.budgetMax) <= 0) e.budgetMax = 'Le budget doit être positif.';
  if (f.kind !== 'free_delivery') {
    for (const x of f.shares) {
      const v = Number(x.shareValue);
      if (!x.shareValue || v <= 0) e[`share:${x.shopId}`] = 'Indiquez la part du vendeur.';
      else if (x.shareType === 'percent' && v > 100) e[`share:${x.shopId}`] = 'Un pourcentage ne peut pas dépasser 100.';
      else if (x.shareType === 'fixed' && f.kind === 'fixed' && Number(f.value) > 0 && v > Number(f.value)) e[`share:${x.shopId}`] = 'La part ne peut pas dépasser la réduction.';
      else if (!x.agreed) e[`share:${x.shopId}`] = 'Cochez « Le vendeur a donné son accord » pour enregistrer.';
    }
  }
  return e;
}

function toInputs(d: Date): { date: string; time: string } {
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink/60 mb-1.5">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-burgundy">{error}</p> : hint ? <p className="mt-1 text-[11px] text-ink/45">{hint}</p> : null}
    </div>
  );
}

function Toggle({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`chip ${active ? 'chip-active' : ''} disabled:opacity-40`}>
      {active && <Check size={12} />}{children}
    </button>
  );
}

export default function PromotionForm({
  promotion, shops, onSaved, onCancel,
}: {
  promotion: AdminPromotion | null;
  shops: AdminShopOption[];
  onSaved: (notice: string) => void;
  onCancel: () => void;
}) {
  const isNew = promotion === null;
  const [f, setF] = useState<FormState>(() => initialState(promotion));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState<null | 'draft' | 'activate' | 'save'>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [shareShopToAdd, setShareShopToAdd] = useState('');
  const [shopFilter, setShopFilter] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const toggleIn = (key: 'shopIds' | 'categoryIds' | 'subcategoryRefs', id: string) =>
    setF((prev) => ({ ...prev, [key]: prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id] }));

  // Après une première tentative, les messages suivent la saisie.
  useEffect(() => {
    if (!submitted) return;
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length === 0) setSaveError((prev) => (prev === 'Corrigez les champs signalés.' ? '' : prev));
  }, [f, submitted]);

  // Noms des produits déjà ciblés (modification).
  useEffect(() => {
    const ids = (promotion?.targets ?? []).filter((t) => t.type === 'product').map((t) => t.ref);
    if (ids.length === 0) return;
    let cancelled = false;
    void fetchProductsByIds(ids).then((rows) => {
      if (cancelled) return;
      const byId = new Map(rows.map((r) => [r.id, r]));
      setF((prev) => ({ ...prev, products: prev.products.map((p) => byId.get(p.id) ?? { ...p, name: 'Produit indisponible' }) }));
    });
    return () => { cancelled = true; };
  }, [promotion]);

  // Recherche de produits (300 ms après la dernière frappe).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchActiveProducts(q).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setSearching(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const shopNames = useMemo(() => new Map(shops.map((s) => [s.id, s.name])), [shops]);
  const visibleShops = useMemo(() => {
    const q = shopFilter.trim().toLowerCase();
    return q ? shops.filter((s) => s.name.toLowerCase().includes(q) || f.shopIds.includes(s.id)) : shops;
  }, [shops, shopFilter, f.shopIds]);
  const updateShare = (shopId: string, patch: Partial<ShareState>) =>
    setF((prev) => ({ ...prev, shares: prev.shares.map((x) => (x.shopId === shopId ? { ...x, ...patch } : x)) }));
  const addShare = (shopId: string) => {
    if (!shopId || f.shares.some((x) => x.shopId === shopId)) return;
    setF((prev) => ({ ...prev, shares: [...prev.shares, { shopId, shareType: 'fixed', shareValue: '', agreedNote: '', agreed: false }] }));
    setShareShopToAdd('');
  };
  const targetCount = f.shopIds.length + f.categoryIds.length + f.subcategoryRefs.length + f.products.length;

  const applyDuration = (hours: number) => {
    const base = dakarInputsToIso(f.startDate, f.startTime);
    const start = base ? new Date(base) : new Date(Math.floor(Date.now() / 60000) * 60000);
    const end = new Date(start.getTime() + hours * 3600000);
    const s = toInputs(start);
    const e = toInputs(end);
    setF((prev) => ({ ...prev, startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time }));
  };
  const applyWeekend = () => {
    const now = new Date(Math.floor(Date.now() / 60000) * 60000);
    const day = now.getUTCDay(); // Dakar = UTC+0
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let start: Date;
    let sunday: number;
    if (day === 6 || day === 0) {
      start = now;
      sunday = midnight + (day === 6 ? 1 : 0) * 86400000;
    } else {
      const saturday = midnight + (6 - day) * 86400000;
      start = new Date(saturday);
      sunday = saturday + 86400000;
    }
    const s = toInputs(start);
    const e = toInputs(new Date(sunday + (23 * 60 + 59) * 60000));
    setF((prev) => ({ ...prev, startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time }));
  };

  const submit = async (mode: 'draft' | 'activate' | 'save') => {
    const errs = validate(f);
    setErrors(errs);
    setSubmitted(true);
    if (Object.keys(errs).length > 0) { setSaveError('Corrigez les champs signalés.'); return; }
    setSaveError('');
    setSaving(mode);
    const targets: PromotionTarget[] = [
      ...f.shopIds.map((ref) => ({ type: 'shop' as const, ref })),
      ...f.categoryIds.map((ref) => ({ type: 'category' as const, ref })),
      ...f.subcategoryRefs.map((ref) => ({ type: 'subcategory' as const, ref })),
      ...f.products.map((p) => ({ type: 'product' as const, ref: p.id })),
    ];
    const result = await saveAdminPromotion({
      id: promotion?.id,
      name: f.name,
      code: f.code || null,
      kind: f.kind,
      value: f.kind === 'free_delivery' ? 0 : Number(f.value),
      maxDiscount: f.kind === 'percent' ? intOrNull(f.maxDiscount) : null,
      minAmount: Number(f.minAmount || 0),
      deliveryCap: f.kind === 'free_delivery' ? intOrNull(f.deliveryCap) : null,
      startsAt: dakarInputsToIso(f.startDate, f.startTime) as string,
      endsAt: dakarInputsToIso(f.endDate, f.endTime) as string,
      audience: f.audience,
      maxUsesTotal: intOrNull(f.maxUsesTotal),
      maxUsesPerCustomer: Number(f.maxUsesPerCustomer),
      budgetMax: intOrNull(f.budgetMax),
      targets,
      sellerShares: f.kind === 'free_delivery' ? [] : f.shares.map((x) => ({
        shopId: x.shopId, shareType: x.shareType, shareValue: Number(x.shareValue), agreedNote: x.agreedNote.trim() || null,
      })),
    });
    if (result.error || !result.id) {
      setSaving(null);
      setSaveError(result.error ?? 'Enregistrement impossible. Réessayez.');
      return;
    }
    if (mode === 'activate') {
      const st = await setAdminPromotionStatus(result.id, 'active');
      setSaving(null);
      onSaved(st.error ? `Campagne enregistrée en brouillon, activation impossible : ${st.error}` : 'Campagne créée et activée.');
      return;
    }
    setSaving(null);
    onSaved(isNew ? 'Campagne enregistrée en brouillon.' : 'Campagne modifiée.');
  };

  const valueSuffix = f.kind === 'percent' ? '%' : 'FCFA';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">{isNew ? 'Nouvelle campagne' : 'Modifier la campagne'}</h2>
        <button type="button" onClick={onCancel} className="btn-ghost px-3" aria-label="Fermer le formulaire"><X size={16} /> Fermer</button>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-cream/70 p-3 text-xs text-ink/60">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-burgundy" />
        Le vendeur reçoit automatiquement le prix normal moins sa commission habituelle ; Ezial prend en charge la réduction, sauf la part que le vendeur a acceptée.
      </p>

      <Section title="Campagne">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom" htmlFor="promo-name" error={errors.name}>
            <input id="promo-name" className="input-field" value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Ex : Tabaski 2026" />
          </Field>
          <Field label="Code promo (facultatif)" htmlFor="promo-code" error={errors.code} hint={f.code ? 'Le client saisit ce code au paiement.' : 'Sans code : s’applique automatiquement.'}>
            <input
              id="promo-code"
              className="input-field font-mono uppercase"
              value={f.code}
              maxLength={30}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="Ex : TABASKI10"
            />
          </Field>
        </div>
      </Section>

      <Section title="Réduction">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Type de réduction">
          {(Object.keys(KIND_LABELS) as PromotionKind[]).map((k) => (
            <Toggle key={k} active={f.kind === k} onClick={() => set('kind', k)}>{KIND_LABELS[k]}</Toggle>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {f.kind !== 'free_delivery' && (
            <Field label={`Valeur (${valueSuffix})`} htmlFor="promo-value" error={errors.value}>
              <input id="promo-value" inputMode="numeric" className="input-field" value={f.value} onChange={(e) => set('value', digits(e.target.value).slice(0, f.kind === 'percent' ? 3 : 9))} placeholder={f.kind === 'percent' ? 'Ex : 10' : 'Ex : 2000'} />
            </Field>
          )}
          {f.kind === 'percent' && (
            <Field label="Plafond de réduction (FCFA, facultatif)" htmlFor="promo-cap" error={errors.maxDiscount}>
              <input id="promo-cap" inputMode="numeric" className="input-field" value={f.maxDiscount} onChange={(e) => set('maxDiscount', digits(e.target.value).slice(0, 9))} placeholder="Ex : 5000" />
            </Field>
          )}
          {f.kind === 'free_delivery' && (
            <Field label="Plafond de livraison offerte (FCFA, facultatif)" htmlFor="promo-dcap" error={errors.deliveryCap} hint="Au prorata des articles concernés livrés.">
              <input id="promo-dcap" inputMode="numeric" className="input-field" value={f.deliveryCap} onChange={(e) => set('deliveryCap', digits(e.target.value).slice(0, 9))} placeholder="Ex : 2000" />
            </Field>
          )}
          <Field label="Minimum d’achat (FCFA, articles concernés)" htmlFor="promo-min" error={errors.minAmount}>
            <input id="promo-min" inputMode="numeric" className="input-field" value={f.minAmount} onChange={(e) => set('minAmount', digits(e.target.value).slice(0, 9))} placeholder="Aucun" />
          </Field>
        </div>
      </Section>

      <Section title="Dates de l’offre (heure de Dakar)">
        <p className="text-[11px] text-ink/50">Choisissez le début, puis une durée : la fin se remplit toute seule. Heures de Dakar.</p>
        <Field label="L’offre commence le" error={errors.start}>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2 sm:max-w-md">
            <input type="date" aria-label="Date de début" className="input-field px-3" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <input type="time" aria-label="Heure de début" className="input-field px-3" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </div>
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink/60">Durée de l’offre</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Durée de l’offre">
            {([['2 h', 2], ['24 h', 24], ['48 h', 48], ['14 jours', 24 * 14]] as const).map(([label, h]) => (
              <button key={label} type="button" onClick={() => applyDuration(h)} className="chip"><Zap size={12} />{label}</button>
            ))}
            <button type="button" onClick={applyWeekend} className="chip"><Zap size={12} />Ce week-end</button>
          </div>
        </div>
        <Field label="L’offre se termine le" error={errors.end}>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2 sm:max-w-md">
            <input type="date" aria-label="Date de fin" className="input-field px-3" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
            <input type="time" aria-label="Heure de fin" className="input-field px-3" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
        </Field>
      </Section>

      <Section title="Conditions">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Public">
          <Toggle active={f.audience === 'all'} onClick={() => set('audience', 'all')}>Tous les clients</Toggle>
          <Toggle active={f.audience === 'new_customers'} onClick={() => set('audience', 'new_customers')}>Nouveaux clients</Toggle>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Utilisations max au total" htmlFor="promo-maxuses" error={errors.maxUsesTotal}>
            <input id="promo-maxuses" inputMode="numeric" className="input-field" value={f.maxUsesTotal} onChange={(e) => set('maxUsesTotal', digits(e.target.value).slice(0, 7))} placeholder="Illimité" />
          </Field>
          <Field label="Par client" htmlFor="promo-percustomer" error={errors.maxUsesPerCustomer}>
            <input id="promo-percustomer" inputMode="numeric" className="input-field" value={f.maxUsesPerCustomer} onChange={(e) => set('maxUsesPerCustomer', digits(e.target.value).slice(0, 4))} />
          </Field>
          <Field label="Budget max (FCFA)" htmlFor="promo-budget" error={errors.budgetMax}>
            <input id="promo-budget" inputMode="numeric" className="input-field" value={f.budgetMax} onChange={(e) => set('budgetMax', digits(e.target.value).slice(0, 10))} placeholder="Illimité" />
          </Field>
        </div>
      </Section>

      <Section title="Cibles" aside={<span className="text-[11px] text-ink/50">{targetCount === 0 ? 'Aucune cible : tout le catalogue' : `${targetCount} cible${targetCount > 1 ? 's' : ''}`}</span>}>
        <div>
          <p className="text-xs font-medium text-ink/60 mb-1.5">Boutiques</p>
          {shops.length > 10 && (
            <input className="input-field mb-2 py-2" value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} placeholder="Filtrer les boutiques" aria-label="Filtrer les boutiques" />
          )}
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {visibleShops.length === 0 && <p className="text-xs text-ink/45">Aucune boutique active.</p>}
            {visibleShops.map((s) => (
              <Toggle key={s.id} active={f.shopIds.includes(s.id)} onClick={() => toggleIn('shopIds', s.id)}>{s.name}</Toggle>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-ink/60 mb-1.5">Catégories et sous-catégories</p>
          <div className="space-y-2">
            {categories.map((c) => {
              const whole = f.categoryIds.includes(c.id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5">
                  <Toggle active={whole} onClick={() => {
                    setF((prev) => ({
                      ...prev,
                      categoryIds: whole ? prev.categoryIds.filter((x) => x !== c.id) : [...prev.categoryIds, c.id],
                      // Catégorie entière : ses sous-catégories deviennent inutiles.
                      subcategoryRefs: whole ? prev.subcategoryRefs : prev.subcategoryRefs.filter((r) => !r.startsWith(`${c.id}/`)),
                    }));
                  }}>{c.label}</Toggle>
                  {!whole && c.subcategories.map((s) => {
                    const ref = `${c.id}/${s.id}`;
                    const on = f.subcategoryRefs.includes(ref);
                    return (
                      <button key={ref} type="button" aria-pressed={on} onClick={() => toggleIn('subcategoryRefs', ref)} className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${on ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line text-ink/55'}`}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-ink/60 mb-1.5">Produits</p>
          {f.products.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {f.products.map((p) => (
                <span key={p.id} className="chip chip-active">
                  {p.name}{p.shopId && shopNames.get(p.shopId) ? <span className="text-ink/40"> · {shopNames.get(p.shopId)}</span> : null}
                  <button type="button" onClick={() => set('products', f.products.filter((x) => x.id !== p.id))} aria-label={`Retirer ${p.name}`}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input className="input-field py-2.5 pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit actif par nom" aria-label="Rechercher un produit" />
          </div>
          {query.trim().length >= 2 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-white">
              {searching ? (
                <p className="p-3 text-xs text-ink/45"><Loader2 size={13} className="mr-1 inline animate-spin" />Recherche…</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-xs text-ink/45">Aucun produit actif trouvé.</p>
              ) : results.map((r) => {
                const added = f.products.some((p) => p.id === r.id);
                return (
                  <button key={r.id} type="button" disabled={added} onClick={() => set('products', [...f.products, r])} className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2.5 text-left text-sm last:border-0 hover:bg-cream/60 disabled:opacity-50">
                    <span className="min-w-0 truncate">{r.name}<span className="text-ink/40"> · {shopNames.get(r.shopId) ?? 'Boutique'}</span></span>
                    <span className="flex-shrink-0 text-xs text-burgundy">{added ? 'Ajouté' : 'Ajouter'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {f.kind !== 'free_delivery' && (
        <Section title="Participation des vendeurs (facultatif)">
          <p className="text-[11px] text-ink/55">Le vendeur reçoit automatiquement le prix normal moins sa commission habituelle ; Ezial prend en charge la réduction, sauf la part que le vendeur a acceptée. Cette part est déduite automatiquement de sa vente (jamais au-delà de ce qu’il touche, jamais sur la livraison offerte). Commission inchangée.</p>
          <p className="text-[11px] text-ink/45">Exemple : réduction 2 500 FCFA, part vendeur 1 000 FCFA → 1 000 FCFA déduits de la vente du vendeur, 1 500 FCFA pris en charge par Ezial.</p>
          {f.shares.map((x) => {
            const err = errors[`share:${x.shopId}`];
            return (
              <div key={x.shopId} className="space-y-2.5 rounded-xl border border-line bg-cream/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-ink">{shopNames.get(x.shopId) ?? 'Boutique'}</p>
                  <button type="button" onClick={() => set('shares', f.shares.filter((y) => y.shopId !== x.shopId))} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-cream" aria-label={`Retirer la part de ${shopNames.get(x.shopId) ?? 'cette boutique'}`}><X size={15} /></button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Type de part">
                  <Toggle active={x.shareType === 'fixed'} onClick={() => updateShare(x.shopId, { shareType: 'fixed' })}>Montant par commande (FCFA)</Toggle>
                  <Toggle active={x.shareType === 'percent'} onClick={() => updateShare(x.shopId, { shareType: 'percent' })}>Pourcentage de la réduction (%)</Toggle>
                </div>
                <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <input inputMode="numeric" className="input-field py-2.5" aria-label={x.shareType === 'fixed' ? 'Part du vendeur en FCFA' : 'Part du vendeur en %'} value={x.shareValue} onChange={(e) => updateShare(x.shopId, { shareValue: digits(e.target.value).slice(0, x.shareType === 'percent' ? 3 : 9) })} placeholder={x.shareType === 'fixed' ? 'Ex : 1000' : 'Ex : 40'} />
                  <input className="input-field py-2.5" aria-label="Note sur l’accord" maxLength={200} value={x.agreedNote} onChange={(e) => updateShare(x.shopId, { agreedNote: e.target.value })} placeholder="Note (ex. accord par WhatsApp le 21/11)" />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink/75">
                  <input type="checkbox" checked={x.agreed} onChange={(e) => updateShare(x.shopId, { agreed: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
                  Le vendeur a donné son accord
                </label>
                {err && <p className="text-xs text-burgundy">{err}</p>}
              </div>
            );
          })}
          {shops.some((s) => !f.shares.some((x) => x.shopId === s.id)) && (
            <div className="flex gap-2">
              <select className="input-field flex-1 py-2.5" value={shareShopToAdd} onChange={(e) => setShareShopToAdd(e.target.value)} aria-label="Boutique qui participe">
                <option value="">Choisir une boutique…</option>
                {shops.filter((s) => !f.shares.some((x) => x.shopId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" onClick={() => addShare(shareShopToAdd)} disabled={!shareShopToAdd} className="btn-outline flex-shrink-0 px-4 py-2.5"><Plus size={14} /> Ajouter</button>
            </div>
          )}
        </Section>
      )}

      <div className="card sticky bottom-3 z-10 space-y-2 p-3 card-shadow sm:p-4">
        {saveError && <p className="text-xs text-burgundy" role="alert">{saveError}</p>}
        <div className="flex flex-wrap gap-2">
          {isNew ? (
            <>
              <button type="button" onClick={() => void submit('activate')} disabled={saving !== null} className="btn-primary flex-1 px-4">
                {saving === 'activate' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Créer et activer
              </button>
              <button type="button" onClick={() => void submit('draft')} disabled={saving !== null} className="btn-outline flex-1 px-4">
                {saving === 'draft' && <Loader2 size={15} className="animate-spin" />} Enregistrer en brouillon
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void submit('save')} disabled={saving !== null} className="btn-primary flex-1 px-4">
              {saving === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={saving !== null} className="btn-ghost px-4">Annuler</button>
        </div>
      </div>
    </div>
  );
}
