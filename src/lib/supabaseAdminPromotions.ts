import { supabase } from './supabaseClient';
import { isDeletedShop } from './deletedShop';
import { isModuleMissing, isRpcMissing } from './supabaseFeatureDetect';

// Campagnes promotionnelles — phase 1, côté administration (Ezial Admin).
// Contrat : docs/promotions/contrat-phase1.md. Tout passe par les fonctions
// serveur admin_* (contrôle de la table admins, comme les autres fonctions
// admin) ; l'interface ne calcule aucune réduction et ne fait que relire ce
// que le serveur renvoie. Pas de compensation manuelle : le vendeur est payé
// automatiquement (prix normal − commission habituelle − part acceptée).
//
// Formes JSON supposées (le contrat ne fixe que les noms et les paramètres) :
// - admin_promotions_list() : tableau (ou { promotions: [...] }) d'objets aux
//   noms de colonnes de `promotions` (snake_case), plus `targets`
//   [{ target_type, target_ref }], `seller_shares` [{ shop_id, share_type,
//   share_value, agreed_note }] et `stats` { orders, product_discount,
//   delivery_discount, ezial_cost, seller_funded, budget_remaining, sales,
//   commissions, ezial_net }. La lecture accepte aussi le camelCase.
// - admin_promotion_save(p) : p reprend les colonnes de `promotions`
//   (snake_case, sans uses_count / budget_used / status), plus `targets`
//   [{ target_type, target_ref }] et `seller_shares` [{ shop_id, share_type
//   'fixed'|'percent', share_value, agreed_note }] (vide pour « livraison
//   offerte »). `id` absent = création (statut brouillon côté serveur). Pour
//   « livraison offerte », value = 0 (seul delivery_cap compte).
//   Les campagnes valent pour toute la région de Dakar (pas de quartiers).

export const PROMOTIONS_MISSING_MESSAGE = 'Les campagnes seront disponibles après la mise à jour de la base.';

export type PromotionKind = 'fixed' | 'percent' | 'free_delivery';
export type PromotionStatus = 'draft' | 'active' | 'paused' | 'ended';
export type PromotionAudience = 'all' | 'new_customers';
export type PromotionTargetType = 'product' | 'shop' | 'category' | 'subcategory';

export const KIND_LABELS: Record<PromotionKind, string> = {
  fixed: 'Réduction fixe',
  percent: 'Pourcentage',
  free_delivery: 'Livraison offerte',
};

export interface PromotionTarget { type: PromotionTargetType; ref: string }

export type SellerShareType = 'fixed' | 'percent';
/** Part de la réduction financée par une boutique, avec son accord. */
export interface SellerShare { shopId: string; shareType: SellerShareType; shareValue: number; agreedNote: string | null }

export interface PromotionStats {
  orders: number;
  productDiscount: number;
  deliveryDiscount: number;
  ezialCost: number;
  sellerFunded: number;
  budgetRemaining: number | null;
  sales: number;
  commissions: number;
  ezialNet: number;
}

export interface AdminPromotion {
  id: string;
  name: string;
  code: string | null;
  kind: PromotionKind;
  value: number;
  maxDiscount: number | null;
  minAmount: number;
  deliveryCap: number | null;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  audience: PromotionAudience;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number;
  budgetMax: number | null;
  usesCount: number;
  budgetUsed: number;
  targets: PromotionTarget[];
  sellerShares: SellerShare[];
  stats: PromotionStats;
}

export interface PromotionInput {
  id?: string;
  name: string;
  code: string | null;
  kind: PromotionKind;
  value: number;
  maxDiscount: number | null;
  minAmount: number;
  deliveryCap: number | null;
  startsAt: string;
  endsAt: string;
  audience: PromotionAudience;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number;
  budgetMax: number | null;
  targets: PromotionTarget[];
  sellerShares: SellerShare[];
}

export interface AdminShopOption { id: string; name: string; isOfficial: boolean }
export interface ProductOption { id: string; name: string; shopId: string }

type Raw = Record<string, unknown>;
type SupabaseLikeError = { code?: string; message?: string } | null;

// Lit une valeur en snake_case puis en camelCase.
function pick(row: Raw, snake: string): unknown {
  if (row[snake] !== undefined) return row[snake];
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return row[camel];
}
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function asArray(data: unknown, key: string): Raw[] {
  if (Array.isArray(data)) return data as Raw[];
  if (data && typeof data === 'object' && Array.isArray((data as Raw)[key])) return (data as Raw)[key] as Raw[];
  return [];
}

/** Message affichable : « module absent », message métier du serveur, ou message générique. */
function friendlyError(error: SupabaseLikeError, fallback: string): string {
  if (!error) return fallback;
  if (isRpcMissing(error) || isModuleMissing(error)) return PROMOTIONS_MISSING_MESSAGE;
  if (error.code === '23505') return 'Ce code existe déjà.';
  if (error.code === '42501') return 'Accès réservé aux administrateurs.';
  // Exceptions levées par les fonctions (RAISE … : P0001, 22023, 23514) : messages français du serveur.
  if (error.message && (error.code === 'P0001' || error.code === '22023' || error.code === '23514')) return error.message;
  return fallback;
}

function mapStats(raw: unknown): PromotionStats {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Raw;
  return {
    orders: num(pick(s, 'orders')),
    productDiscount: num(pick(s, 'product_discount')),
    deliveryDiscount: num(pick(s, 'delivery_discount')),
    ezialCost: num(pick(s, 'ezial_cost')),
    sellerFunded: num(pick(s, 'seller_funded')),
    budgetRemaining: numOrNull(pick(s, 'budget_remaining')),
    sales: num(pick(s, 'sales')),
    commissions: num(pick(s, 'commissions')),
    ezialNet: num(pick(s, 'ezial_net')),
  };
}

function mapPromotion(row: Raw): AdminPromotion {
  const targets = (Array.isArray(row.targets) ? row.targets as Raw[] : []).map((t) => ({
    type: (pick(t, 'target_type') ?? t.type) as PromotionTargetType,
    ref: String(pick(t, 'target_ref') ?? t.ref ?? ''),
  })).filter((t) => t.ref);
  const rawShares = pick(row, 'seller_shares');
  const sellerShares: SellerShare[] = (Array.isArray(rawShares) ? rawShares as Raw[] : []).map((x) => ({
    shopId: String(pick(x, 'shop_id') ?? ''),
    shareType: (pick(x, 'share_type') === 'percent' ? 'percent' : 'fixed') as SellerShareType,
    shareValue: num(pick(x, 'share_value')),
    agreedNote: strOrNull(pick(x, 'agreed_note')),
  })).filter((x) => x.shopId);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    code: strOrNull(row.code),
    kind: (row.kind as PromotionKind) ?? 'fixed',
    value: num(row.value),
    maxDiscount: numOrNull(pick(row, 'max_discount')),
    minAmount: num(pick(row, 'min_amount')),
    deliveryCap: numOrNull(pick(row, 'delivery_cap')),
    startsAt: String(pick(row, 'starts_at') ?? ''),
    endsAt: String(pick(row, 'ends_at') ?? ''),
    status: (row.status as PromotionStatus) ?? 'draft',
    audience: (row.audience as PromotionAudience) ?? 'all',
    maxUsesTotal: numOrNull(pick(row, 'max_uses_total')),
    maxUsesPerCustomer: num(pick(row, 'max_uses_per_customer'), 1),
    budgetMax: numOrNull(pick(row, 'budget_max')),
    usesCount: num(pick(row, 'uses_count')),
    budgetUsed: num(pick(row, 'budget_used')),
    targets,
    sellerShares,
    stats: mapStats(row.stats),
  };
}

export type ListResult<T> = { missing: true } | { missing: false; items: T[]; error?: string };

export async function fetchAdminPromotions(): Promise<ListResult<AdminPromotion>> {
  const { data, error } = await supabase.rpc('admin_promotions_list');
  if (error) {
    if (isRpcMissing(error) || isModuleMissing(error)) return { missing: true };
    return { missing: false, items: [], error: friendlyError(error, 'Impossible de charger les campagnes. Réessayez.') };
  }
  return { missing: false, items: asArray(data, 'promotions').map(mapPromotion) };
}

export async function saveAdminPromotion(input: PromotionInput): Promise<{ id?: string; error?: string }> {
  const p: Raw = {
    name: input.name.trim(),
    code: input.code ? input.code.trim().toUpperCase() : null,
    kind: input.kind,
    value: input.kind === 'free_delivery' ? 0 : input.value,
    max_discount: input.kind === 'percent' ? input.maxDiscount : null,
    min_amount: input.minAmount,
    delivery_cap: input.kind === 'free_delivery' ? input.deliveryCap : null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    audience: input.audience,
    max_uses_total: input.maxUsesTotal,
    max_uses_per_customer: input.maxUsesPerCustomer,
    budget_max: input.budgetMax,
    targets: input.targets.map((t) => ({ target_type: t.type, target_ref: t.ref })),
    seller_shares: input.kind === 'free_delivery' ? [] : input.sellerShares.map((x) => ({
      shop_id: x.shopId,
      share_type: x.shareType,
      share_value: x.shareValue,
      agreed_note: x.agreedNote?.trim() || null,
    })),
  };
  if (input.id) p.id = input.id;
  const { data, error } = await supabase.rpc('admin_promotion_save', { p });
  if (error) return { error: friendlyError(error, 'Enregistrement impossible. Réessayez.') };
  return { id: typeof data === 'string' ? data : input.id };
}

export async function setAdminPromotionStatus(id: string, status: Exclude<PromotionStatus, 'draft'>): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_promotion_set_status', { p_id: id, p_status: status });
  return error ? { error: friendlyError(error, 'Changement de statut impossible. Réessayez.') } : {};
}

/** Boutiques actives (hors boutiques supprimées), pour les cibles d'une campagne. */
export async function fetchActiveShopOptions(): Promise<AdminShopOption[]> {
  const { data, error } = await supabase.from('shops').select('id, name, status, is_official').eq('status', 'active').order('name', { ascending: true });
  if (error || !data) return [];
  return data.filter((s) => !isDeletedShop(s)).map((s) => ({ id: String(s.id), name: String(s.name ?? ''), isOfficial: s.is_official === true }));
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Recherche par nom parmi les produits actifs (non archivés). */
export async function searchActiveProducts(query: string): Promise<ProductOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[%_,()]/g, ' ')}%`;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, shop_id')
    .eq('status', 'active')
    .is('archived_at', null)
    .ilike('name', pattern)
    .order('name', { ascending: true })
    .limit(20);
  if (error || !data) return [];
  const needle = normalize(q);
  return data
    .map((r) => ({ id: String(r.id), name: String(r.name ?? ''), shopId: String(r.shop_id ?? '') }))
    .filter((p) => normalize(p.name).includes(needle));
}

/** Noms des produits déjà ciblés (modification d'une campagne). */
export async function fetchProductsByIds(ids: string[]): Promise<ProductOption[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('products').select('id, name, shop_id').in('id', ids);
  if (error || !data) return [];
  return data.map((r) => ({ id: String(r.id), name: String(r.name ?? ''), shopId: String(r.shop_id ?? '') }));
}

// ---- Dates : heure de Dakar = UTC+0 toute l'année ----

const DAKAR_TZ = 'Africa/Dakar';

/** « 21 nov. 2026, 10:00 » en heure de Dakar. */
export function formatDakarDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { timeZone: DAKAR_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Champs date (AAAA-MM-JJ) et heure (HH:MM) en heure de Dakar → ISO. */
export function dakarInputsToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → champs date et heure en heure de Dakar. */
export function isoToDakarInputs(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}
