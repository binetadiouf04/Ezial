import { useState, useMemo, useEffect } from 'react';
import { usePro } from '../../ProContext';
import { categories, categoryMap, type CategoryId } from '@/data/categories';
import { getFilters, type FilterGroup } from '@/data/filters';
import { discountPercent } from '@/data/products';
import { getColor } from '@/data/colors';
import VendorNoticeBanner, { type VendorNotice } from '../../components/VendorNoticeBanner';
import { fetchModerationFlags, latestUnresolvedFlag } from '@/lib/supabaseModeration';
import {
  createProductInSupabase,
  updateProductInSupabase,
  fetchProductForEdit,
  deleteProductImage,
  addProductMedia,
  reorderProductMedia,
  MAX_PRODUCT_MEDIA_ITEMS,
  MAX_PRODUCT_VIDEOS,
  MAX_VIDEO_SIZE_MB,
  ACCEPTED_VIDEO_MIME_TYPES,
  type SupabaseProductStatus,
  type NewProductMedia,
} from '@/lib/supabaseSellerProducts';
import { resolveImageUrl } from '@/lib/supabaseCatalog';
import ImageCropModal from '../../components/ImageCropModal';
import LogoOverlayModal, { type OverlayResult } from '../../components/LogoOverlayModal';
import { ArrowLeft, X, Package, ChevronDown, Check, Camera, Star, Video, ArrowUp, ArrowDown, Sparkles, Crop, RefreshCw } from 'lucide-react';

// products.status in Supabase only accepts draft/active/flagged/disabled —
// there is no 'published' value there. The form's own draft/published
// choice (used everywhere else in the local mock product model) is mapped
// to the Supabase-accepted value only at the point of writing to Supabase.
const SUPABASE_STATUS_FOR_FORM_STATUS: Record<'draft' | 'published', SupabaseProductStatus> = {
  draft: 'draft',
  published: 'active',
};

// Which filter groups are single-choice (radio-like) vs descriptive multi-choice
// (checkbox-like, but never split stock) vs true variant dimensions (checkbox-like
// AND generate one stock/price line per selected value).
const SINGLE_CHOICE_IDS = new Set(['type', 'style', 'texture', 'matiere', 'peau', 'typeproduit', 'longueurongles']);
// The one exception to 'type' being single-choice: for Vêtements > Femme,
// several clothing types can describe the same product (e.g. "Robes" and
// "Tenues de plage"). Still purely descriptive — 'type' was never a variant
// dimension, so this never generates stock/price combinations.
const isVetementsFemmeTypeGroup = (categoryId: string, subId: string, groupId: string): boolean =>
  categoryId === 'vetements' && subId === 'femme' && groupId === 'type';
// Only these represent a genuinely different version of the product being sold —
// the ones allowed to generate stock/price combinations. Descriptive multi-choice
// attributes like "besoin" or "famille" (notes olfactives) are intentionally left
// out: several can apply at once, but they only describe the product and must
// never split it into separate stock lines.
const VARIANT_DIMENSION_IDS = new Set(['taille', 'couleur', 'longueur', 'densite', 'volume']);
const COLOR_GROUP_IDS = new Set(['couleur']);

// Number of colors to show before "Voir plus"
const COLOR_PREVIEW_COUNT = 8;

const VOLUME_BASE_OPTIONS = ['30 ml', '50 ml', '100 ml', 'Autre'];
// Encens "Type" — descriptive only (choix multiple, jamais une variante de
// stock — the group id is new and isn't in VARIANT_DIMENSION_IDS).
const ENCENS_TYPE_OPTIONS = ['Gowé', 'Sarkhtan', 'Nakk', 'Bant'];
// Encens & Parfums de maison "Notes" (Diffuseur, Bougie, Huile à brûler,
// Parfum d'ambiance — never Encens) — also descriptive/multi-choice only,
// same reasoning as ENCENS_TYPE_OPTIONS above.
const ENCENS_MAISON_NOTES_OPTIONS = ['Orientale', 'Fruitée', 'Florale', 'Boisée'];

// Manucure & Pédicure > Faux ongles only — Longueur/Forme/Type de style are
// purely descriptive (none of these ids are in VARIANT_DIMENSION_IDS), and
// never shown for Soins, Henné or Vernis.
const NAIL_LENGTH_OPTIONS = ['Court', 'Moyen', 'Long'];
const NAIL_SHAPE_OPTIONS = ['Carré', 'Amande', 'Coffin', 'Stiletto', 'Ovale', 'Rond'];
const NAIL_STYLE_OPTIONS = ['French', 'Nude', 'Marbré', 'Floral', '3D', 'Strass', 'Pailleté', 'Chromé', 'Léopard', 'Abstrait'];

// Human labels for validate()'s error keys, used to build a clear summary
// of exactly which field is blocking "Publier"/"Enregistrer en brouillon".
const VALIDATION_FIELD_LABELS: Record<string, string> = {
  category: 'Catégorie',
  name: 'Nom du produit',
  description: 'Description',
  price: 'Prix',
  images: 'Photos',
};

// Maquillage: the color/teinte palette depends on the type of product chosen —
// a foundation needs skin tones, a lipstick needs lip shades, etc.
const skinToneShades = ['Très clair', 'Clair', 'Medium', 'Caramel', 'Doré', 'Brun', 'Brun foncé', 'Deep'];
const lipShades = ['Nude', 'Rose nude', 'Mauve', 'Bordeaux', 'Rouge', 'Brun', 'Chocolat', 'Prune', 'Corail'];
const eyeShades = ['Noir', 'Brun', 'Bleu', 'Vert', 'Bordeaux', 'Blanc'];
const eyeshadowShades = ['Or', 'Cuivré', 'Bronze', 'Marron', 'Chocolat', 'Taupe', 'Rose', 'Prune', 'Violet', 'Noir', 'Blanc', 'Nude', 'Doré', 'Argenté', 'Vert', 'Bleu', 'Turquoise'];
const blushShades = ['Rose', 'Pêche', 'Terracotta', 'Prune', 'Brun rosé'];
const highlighterShades = ['Doré', 'Or rose', 'Argenté', 'Beige'];

const makeupColorsByType: Record<string, string[]> = {
  'Fond de teint': skinToneShades,
  'Anticernes': skinToneShades,
  'Poudre': skinToneShades,
  'Bronzer': skinToneShades,
  'Highlighter': highlighterShades,
  'Rouge à lèvres': lipShades,
  'Gloss': lipShades,
  'Crayon à lèvres': lipShades,
  'Mascara': eyeShades,
  'Eyeliner': eyeShades,
  'Crayon à sourcils': eyeShades,
  'Fard à paupières': eyeshadowShades,
  'Palette': eyeshadowShades,
  'Blush': blushShades,
};

// Short placeholder examples for "Nom du produit" / "Description", to help the
// seller without pre-filling the fields. Keyed by category/subcategory, with a
// category-level and a generic fallback.
const examplesBySubcategory: Record<string, { name: string; description: string }> = {
  'vetements/femme': { name: 'Ex. Robe longue satinée', description: 'Ex. Robe fluide, coupe élégante, idéale pour les sorties et événements.' },
  'vetements/homme': { name: 'Ex. Chemise slim en lin', description: 'Ex. Chemise légère, coupe ajustée, idéale pour les journées chaudes.' },
  'chaussures/femme': { name: 'Ex. Escarpins talon 8 cm', description: 'Ex. Escarpins élégants et confortables, pour le bureau ou la soirée.' },
  'chaussures/homme': { name: 'Ex. Mocassins en cuir', description: 'Ex. Mocassins souples en cuir véritable, semelle confortable.' },
  'sacs/sacs-a-main': { name: 'Ex. Sac à main structuré', description: 'Ex. Sac en cuir, format moyen, compartiment intérieur zippé.' },
  'beaute/maquillage': { name: 'Ex. Rouge à lèvres mat', description: 'Ex. Rouge à lèvres longue tenue, fini mat, confortable à porter.' },
  'beaute/skincare': { name: 'Ex. Sérum hydratant visage', description: 'Ex. Sérum léger pour peau sèche à mixte, hydratation quotidienne.' },
  'beaute/soins-capillaires': { name: 'Ex. Shampoing hydratant', description: 'Ex. Shampoing doux, nettoie en douceur et hydrate les cheveux secs.' },
  'beaute/hygiene': { name: 'Ex. Gel douche karité', description: 'Ex. Gel douche hydratant au beurre de karité, parfum doux.' },
  'cheveux/perruques': { name: 'Ex. Perruque Body Wave 22 pouces', description: 'Ex. Perruque naturelle, densité 180 %, couleur noir naturel.' },
  'cheveux/meches': { name: 'Ex. Mèches lisses 20 pouces', description: 'Ex. Mèches 100% naturelles, pose facile, tenue longue durée.' },
  'parfums/parfums-femme': { name: 'Ex. Eau de parfum vanille ambrée', description: 'Ex. Parfum femme aux notes vanillées, ambrées et florales.' },
  'parfums/parfums-homme': { name: 'Ex. Eau de parfum boisée épicée', description: 'Ex. Parfum homme aux notes boisées, épicées et ambrées.' },
  'parfums/huiles-brumes': { name: 'Ex. Brume parfumée fleur de tiaré', description: 'Ex. Brume légère et fraîche, à vaporiser sur la peau ou les cheveux.' },
  'parfums/encens-parfums-maison': { name: 'Ex. Encens oud premium', description: 'Ex. Encens naturel au oud, parfum boisé et enveloppant.' },
  'bijoux/colliers': { name: 'Ex. Collier fin plaqué or', description: 'Ex. Collier fin et délicat, plaqué or, pour un port quotidien.' },
  'lingerie/sous-vetements': { name: 'Ex. Culotte coton sans couture', description: 'Ex. Culotte confortable en coton doux, coupe invisible sous les vêtements.' },
};

const examplesByCategory: Record<string, { name: string; description: string }> = {
  vetements: { name: 'Ex. Robe longue satinée', description: 'Ex. Robe fluide, coupe élégante, idéale pour les sorties et événements.' },
  chaussures: { name: 'Ex. Escarpins talon 8 cm', description: 'Ex. Escarpins élégants et confortables.' },
  sacs: { name: 'Ex. Sac à main structuré', description: 'Ex. Sac en cuir véritable, format moyen.' },
  beaute: { name: 'Ex. Sérum hydratant visage', description: 'Ex. Sérum léger pour peau sèche à mixte, hydratation quotidienne.' },
  cheveux: { name: 'Ex. Perruque Body Wave 22 pouces', description: 'Ex. Perruque naturelle, densité 180 %, couleur noir naturel.' },
  parfums: { name: 'Ex. Eau de parfum vanille ambrée', description: 'Ex. Parfum femme aux notes vanillées, ambrées et florales.' },
  bijoux: { name: 'Ex. Collier fin plaqué or', description: 'Ex. Collier délicat pour un port quotidien.' },
  lingerie: { name: 'Ex. Pyjama deux pièces en coton', description: 'Ex. Pyjama doux et confortable, idéal pour les soirées fraîches.' },
};

interface OptionSelection {
  // groupId -> selected values (string[] for multiple, string[0] for single)
  [groupId: string]: string[];
}

// Pure, standalone version of the option-groups derivation — used by both
// the live form (its useMemo just calls this) and the edit-mode loader,
// which needs the exact same category-specific group list to reconstruct
// `selections`/`comboData` from a loaded product's descriptive_attributes
// and variants. Keeping one implementation avoids the two ever drifting
// apart.
function computeOptionGroups(categoryId: string, subId: string, selectedTypeProduit: string | undefined, isMakeup: boolean): FilterGroup[] {
  if (!categoryId) return [];
  let groups = getFilters(categoryId, subId || undefined).filter((g) => g.id !== 'prix');

  if (isMakeup) {
    groups = groups.filter((g) => g.id !== 'couleur');
    const shades = selectedTypeProduit ? makeupColorsByType[selectedTypeProduit] : undefined;
    if (shades && shades.length > 0) {
      groups = [...groups, { id: 'couleur', label: 'Couleur / Teinte', options: shades, collapsible: true }];
    }
  }

  const isEncensMaison = categoryId === 'parfums' && subId === 'encens-parfums-maison';
  const showsEncensType = isEncensMaison && selectedTypeProduit === 'Encens';
  const showsEncensVolume = isEncensMaison && (selectedTypeProduit === 'Huile à brûler' || selectedTypeProduit === 'Parfum d\'ambiance');
  const showsEncensNotesChips = isEncensMaison && Boolean(selectedTypeProduit) && selectedTypeProduit !== 'Encens';
  const showsVolume =
    (categoryId === 'beaute' && (subId === 'skincare' || subId === 'hygiene')) ||
    (categoryId === 'parfums' && (subId === 'parfums-femme' || subId === 'parfums-homme' || subId === 'huiles-brumes')) ||
    showsEncensVolume;
  const isManucurePedicure = categoryId === 'beaute' && subId === 'mains-et-pieds';
  const showsNailFields = isManucurePedicure && selectedTypeProduit === 'Faux ongles';

  if (showsVolume) groups = [...groups, { id: 'volume', label: 'Volume', options: VOLUME_BASE_OPTIONS }];
  if (showsEncensType) groups = [...groups, { id: 'typeencens', label: 'Type', options: ENCENS_TYPE_OPTIONS }];
  if (showsEncensNotesChips) groups = [...groups, { id: 'notesambiance', label: 'Notes', options: ENCENS_MAISON_NOTES_OPTIONS }];
  if (showsNailFields) {
    groups = [
      ...groups,
      { id: 'longueurongles', label: 'Longueur', options: NAIL_LENGTH_OPTIONS },
      { id: 'formeongles', label: 'Forme', options: NAIL_SHAPE_OPTIONS },
      { id: 'styleongles', label: 'Type / style', options: NAIL_STYLE_OPTIONS },
    ];
  }

  return groups;
}

// A generated combination for the stock matrix
interface Combo {
  key: string; // unique key like "36|Noir"
  label: string; // display label like "36 / Noir"
  parts: string[]; // ["36", "Noir"]
  stock: number;
  price: number; // only used when priceByOption is ON
}

// Shared visual for every selectable chip in this form (category,
// subcategory, and every option group except color swatches, which keep
// their own presentation). The check icon's slot is always reserved and
// only toggles opacity, so a chip's width/height never change when it
// becomes selected — no wrapped-under-text checkmark, no layout shift.
function SelectableChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium leading-none transition-colors ${
        selected
          ? 'bg-burgundy text-white border border-burgundy'
          : 'bg-white border border-line text-ink/70 hover:border-ink/25 hover:text-ink'
      }`}
    >
      <span>{label}</span>
      <Check size={13} className={`shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!selected} />
    </button>
  );
}

// One photo or video in the form's media gallery. `existing` is present
// only for media already persisted as a Supabase product_images row
// (needed to delete the right Storage objects + row if removed or
// re-branded); `file` is present only for a newly-selected/edited,
// not-yet-uploaded item. `originalFile`/`logoFile`/`brandingOverlay` are
// set only when a vendor logo overlay was applied — `file` is then the
// composited result, `originalFile` the untouched source a re-branding
// starts from again (never stacking overlays).
interface MediaItem {
  key: string;
  kind: 'image' | 'video';
  previewUrl: string;
  file?: File;
  originalFile?: File;
  logoFile?: File;
  brandingOverlay?: { x: number; y: number; width: number; opacity: number };
  existing?: {
    id: string;
    storagePath: string;
    originalStoragePath: string | null;
    brandingOverlayLogoPath: string | null;
  };
}

export default function SellerProductForm({ productId }: { productId?: string }) {
  const { navigate, name: sellerShopName, addSellerProduct, updateSellerProduct, sellerSupabaseShopId } = usePro();
  const isEditing = Boolean(productId);

  // Real moderation flag on this product (public.moderation_flags), never
  // the mock moderationHistory.
  const [latestModeration, setLatestModeration] = useState<VendorNotice | null>(null);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchModerationFlags('product', productId).then((flags) => {
      if (cancelled) return;
      const active = latestUnresolvedFlag(flags);
      setLatestModeration(active ? { action: 'flagged', vendorMessage: active.note } : null);
    });
    return () => { cancelled = true; };
  }, [productId]);

  // The real product being edited — loaded straight from Supabase by id
  // below (never from ProContext's in-memory mock sellerProducts list,
  // which only ever reflects this browser session and is empty again after
  // a reload: that's what made "Modifier" behave like "Ajouter" before).
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const [existingReference, setExistingReference] = useState('');
  const [existingStatus, setExistingStatus] = useState<SupabaseProductStatus | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [loadError, setLoadError] = useState('');

  const [categoryId, setCategoryId] = useState<string>('');
  const [subId, setSubId] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [images, setImages] = useState<MediaItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageActionError, setImageActionError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Photos awaiting the crop/reposition step, processed one at a time.
  const [pendingCropFiles, setPendingCropFiles] = useState<File[]>([]);
  // Media currently open in the logo-branding modal, and the plain
  // (un-composited) file it should be applied to.
  const [brandingTargetKey, setBrandingTargetKey] = useState<string | null>(null);
  const [brandingBaseFile, setBrandingBaseFile] = useState<File | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);

  // Options state: which values are selected per option group
  const [selections, setSelections] = useState<OptionSelection>({});
  const [showAllColors, setShowAllColors] = useState<Record<string, boolean>>({});

  // Manual value when "Autre" is picked for Volume
  const [customVolumeMl, setCustomVolumeMl] = useState('');
  // Brumes: free-text scent notes, comma-separated (ex. "caramel, vanille
  // fouettée, cassonade") — descriptive only, saved under its own
  // descriptive_attributes key, never a variant dimension.
  const [notesInput, setNotesInput] = useState('');

  // Price by option toggle
  const [priceByOption, setPriceByOption] = useState(false);

  // Promotion (products.is_promo/promo_price/promo_start/promo_end) — the
  // % discount is always derived from price vs promoPrice, never stored or
  // typed in by hand.
  const [isPromo, setIsPromo] = useState(false);
  const [promoPrice, setPromoPrice] = useState('');
  const [promoStart, setPromoStart] = useState('');
  const [promoEnd, setPromoEnd] = useState('');

  // Stock + price per combination (used when the product has real variants)
  const [comboData, setComboData] = useState<Record<string, { stock: number; price: number }>>({});
  // Plain stock (used when the product has no variant dimension at all)
  const [simpleStock, setSimpleStock] = useState('');

  // Loads the real product once, then reconstructs every piece of form
  // state from it: category/subcategory (which together with "Type de
  // produit" drive computeOptionGroups), descriptive_attributes for purely
  // descriptive groups, and each variant row's attributes for the true
  // variant dimensions (taille/couleur/volume/longueur/densité) — grouped
  // back into `selections` and `comboData` the same way the live form
  // would have produced them.
  useEffect(() => {
    if (!productId || !sellerSupabaseShopId) { setLoadingExisting(false); return; }
    let cancelled = false;
    setLoadingExisting(true);
    setLoadError('');
    fetchProductForEdit(productId, sellerSupabaseShopId).then((data) => {
      if (cancelled) return;
      if (!data) {
        setLoadError("Produit introuvable, ou vous n'avez pas accès à ce produit.");
        setLoadingExisting(false);
        return;
      }

      setExistingProductId(data.id);
      setExistingReference(data.reference);
      setExistingStatus(data.status);
      setCategoryId(data.category);
      setSubId(data.subcategory);
      setName(data.name);
      setDescription(data.description);
      setPrice(String(data.basePrice));
      setIsPromo(data.isPromo);
      setPromoPrice(data.promoPrice != null ? String(data.promoPrice) : '');
      setPromoStart(data.promoStart ?? '');
      setPromoEnd(data.promoEnd ?? '');
      setImages(data.images.map((img) => ({
        key: img.id,
        kind: img.mediaType === 'video' ? 'video' as const : 'image' as const,
        previewUrl: img.url,
        existing: {
          id: img.id,
          storagePath: img.storagePath,
          originalStoragePath: img.originalStoragePath,
          brandingOverlayLogoPath: img.brandingOverlay?.logoStoragePath ?? null,
        },
      })));

      const typeproduitValues = data.descriptiveAttributes['Type de produit'];
      const isMakeupCat = data.category === 'beaute' && data.subcategory === 'maquillage';
      const groups = computeOptionGroups(data.category, data.subcategory, typeproduitValues?.[0], isMakeupCat);
      const variantDimGroups = groups.filter((g) => VARIANT_DIMENSION_IDS.has(g.id));

      const newSelections: OptionSelection = {};
      if (typeproduitValues && typeproduitValues.length > 0) newSelections.typeproduit = typeproduitValues;

      let customMl = '';
      for (const g of groups) {
        if (g.id === 'typeproduit') continue;
        if (g.id === 'volume') {
          // "Autre" is saved as the resolved value (e.g. "75 ml"), not the
          // literal word "Autre" — any value outside the fixed presets must
          // re-select "Autre" and restore the manual ml figure.
          const presets = VOLUME_BASE_OPTIONS.filter((o) => o !== 'Autre');
          const raw = new Set<string>();
          for (const v of data.variants) { const val = v.attributes['Volume']; if (val) raw.add(val); }
          const chips = new Set<string>();
          for (const val of raw) {
            if (presets.includes(val)) chips.add(val);
            else { chips.add('Autre'); const m = val.match(/(\d+(?:[.,]\d+)?)/); if (m) customMl = m[1]; }
          }
          if (chips.size > 0) newSelections.volume = [...chips];
          continue;
        }
        if (VARIANT_DIMENSION_IDS.has(g.id)) {
          const values = new Set<string>();
          for (const v of data.variants) { const val = v.attributes[g.label]; if (val) values.add(val); }
          if (values.size > 0) newSelections[g.id] = [...values];
        } else {
          const values = data.descriptiveAttributes[g.label];
          if (values && values.length > 0) newSelections[g.id] = values;
        }
      }
      setSelections(newSelections);
      if (customMl) setCustomVolumeMl(customMl);

      if (data.category === 'parfums' && data.subcategory === 'huiles-brumes') {
        setNotesInput((data.descriptiveAttributes['Notes'] ?? []).join(', '));
      }

      const newComboData: Record<string, { stock: number; price: number }> = {};
      let anyPriceDiffers = false;
      for (const v of data.variants) {
        const parts = variantDimGroups.map((g) => v.attributes[g.label]).filter(Boolean);
        if (parts.length === 0 || parts.length !== variantDimGroups.length) continue;
        newComboData[parts.join('|')] = { stock: v.stock, price: v.price };
        if (v.price !== data.basePrice) anyPriceDiffers = true;
      }
      setComboData(newComboData);
      setPriceByOption(anyPriceDiffers);

      if (Object.keys(newComboData).length === 0) {
        setSimpleStock(String(data.variants[0]?.stock ?? 0));
      }

      setLoadingExisting(false);
    }).catch(() => {
      if (cancelled) return;
      setLoadError('Erreur lors du chargement du produit.');
      setLoadingExisting(false);
    });
    return () => { cancelled = true; };
  }, [productId, sellerSupabaseShopId]);

  const selectedCategory = categoryId ? categoryMap[categoryId as CategoryId] : null;
  const selectedTypeProduit = selections.typeproduit?.[0];

  // Used by toggleSingleChoice to know which extra selections to clear when
  // "Type de produit" changes — computeOptionGroups derives the same
  // category-specific conditions to decide which groups actually render.
  const isEncensMaison = categoryId === 'parfums' && subId === 'encens-parfums-maison';
  const isManucurePedicure = categoryId === 'beaute' && subId === 'mains-et-pieds';

  // Brumes: a simple free-text "Notes" field (caramel, vanille fouettée...)
  // — descriptive only, not a chip list, since scent notes aren't a fixed
  // enum. Handled as its own input further below, not via optionGroups.
  const showsNotes = categoryId === 'parfums' && subId === 'huiles-brumes';

  const isMakeup = categoryId === 'beaute' && subId === 'maquillage';

  const optionGroups: FilterGroup[] = useMemo(
    () => computeOptionGroups(categoryId, subId, selectedTypeProduit, isMakeup),
    [categoryId, subId, selectedTypeProduit, isMakeup],
  );

  // Only "true" variant dimensions (taille, couleur, volume, longueur,
  // densité) generate stock/price combinations — everything else (style, type,
  // besoin, notes olfactives...) is purely descriptive.
  const multiChoiceGroups = optionGroups.filter((g) => VARIANT_DIMENSION_IDS.has(g.id));

  // "Autre" in Volume is replaced by the seller's manual value before it
  // ever reaches the combination logic or the saved product.
  const effectiveValues = (groupId: string): string[] => {
    const raw = selections[groupId] ?? [];
    if (groupId === 'volume') {
      return raw.map((v) => (v === 'Autre' ? (customVolumeMl.trim() ? `${customVolumeMl.trim()} ml` : '') : v)).filter(Boolean);
    }
    return raw;
  };

  // Generate combinations from selected variant-dimension options
  const combinations: Combo[] = useMemo(() => {
    const selectedMulti = multiChoiceGroups
      .map((g) => ({ group: g, values: effectiveValues(g.id) }))
      .filter((s) => s.values.length > 0);

    if (selectedMulti.length === 0) return [];

    // Build cartesian product
    let result: string[][] = selectedMulti[0].values.map((v) => [v]);
    for (let i = 1; i < selectedMulti.length; i++) {
      const next: string[][] = [];
      for (const existing of result) {
        for (const val of selectedMulti[i].values) {
          next.push([...existing, val]);
        }
      }
      result = next;
    }

    return result.map((parts) => ({
      key: parts.join('|'),
      label: parts.join(' / '),
      parts,
      stock: comboData[parts.join('|')]?.stock ?? 0,
      price: comboData[parts.join('|')]?.price ?? (parseInt(price) || 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, multiChoiceGroups, comboData, price, customVolumeMl]);

  const totalStock = useMemo(() => {
    if (combinations.length > 0) {
      return combinations.reduce((sum, c) => sum + (comboData[c.key]?.stock ?? 0), 0);
    }
    return Math.max(0, parseInt(simpleStock) || 0);
  }, [combinations, comboData, simpleStock]);

  // === Handlers ===

  const totalMediaCount = images.length + pendingCropFiles.length;
  const videoCount = images.filter((i) => i.kind === 'video').length;

  // New photos go through the crop/reposition step (ImageCropModal) before
  // they're added to the gallery — queued one at a time so only one modal
  // is ever open, however many files were selected at once.
  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const room = MAX_PRODUCT_MEDIA_ITEMS - totalMediaCount;
    if (room <= 0) { setImageActionError(`Limite de ${MAX_PRODUCT_MEDIA_ITEMS} photos/vidéos par produit atteinte.`); return; }
    const accepted = imageFiles.slice(0, room);
    setImageActionError(accepted.length < imageFiles.length ? `Seules ${accepted.length} photo(s) ont été ajoutées (limite de ${MAX_PRODUCT_MEDIA_ITEMS} atteinte).` : '');
    if (accepted.length > 0) setPendingCropFiles((prev) => [...prev, ...accepted]);
  };

  const handleCropConfirm = (blob: Blob) => {
    const file = new File([blob], `photo-${Date.now()}.webp`, { type: blob.type || 'image/webp' });
    setImages((prev) => [...prev, { key: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind: 'image', previewUrl: URL.createObjectURL(file), file }]);
    setPendingCropFiles((prev) => prev.slice(1));
  };
  const handleCropCancel = () => setPendingCropFiles((prev) => prev.slice(1));

  const handleAddVideo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setImageActionError('');
    if (videoCount >= MAX_PRODUCT_VIDEOS) { setImageActionError('Une seule vidéo par produit est autorisée.'); return; }
    if (totalMediaCount >= MAX_PRODUCT_MEDIA_ITEMS) { setImageActionError(`Limite de ${MAX_PRODUCT_MEDIA_ITEMS} photos/vidéos par produit atteinte.`); return; }
    if (!ACCEPTED_VIDEO_MIME_TYPES.includes(file.type)) { setImageActionError('Format vidéo non supporté (MP4, WebM ou MOV uniquement).'); return; }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) { setImageActionError(`La vidéo dépasse la taille maximale de ${MAX_VIDEO_SIZE_MB} Mo.`); return; }
    setImages((prev) => [...prev, { key: `local-video-${Date.now()}`, kind: 'video', previewUrl: URL.createObjectURL(file), file }]);
  };

  // Persists sort_order + is_primary for every already-persisted (existing)
  // row in one pass, matching the array order shown in the form — called
  // after any reorder, primary change or removal so Supabase never drifts
  // from what the seller sees.
  const persistExistingOrder = (list: MediaItem[]) => {
    if (!existingProductId) return;
    const rows = list
      .map((img, i) => (img.existing ? { id: img.existing.id, sortOrder: i, isPrimary: i === 0 } : null))
      .filter((r): r is { id: string; sortOrder: number; isPrimary: boolean } => Boolean(r));
    if (rows.length > 0) {
      reorderProductMedia(rows).then((r) => { if (r.error) setImageActionError(r.error); });
    }
  };

  const moveImage = (key: string, direction: -1 | 1) => {
    const idx = images.findIndex((i) => i.key === key);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= images.length) return;
    const next = [...images];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setImages(next);
    persistExistingOrder(next);
  };

  // Removing a photo/video that's already a real Supabase product_images
  // row deletes the Storage file(s) — main, plus original + logo when a
  // branding overlay was applied — and the row itself immediately, never
  // left dangling.
  const removeImage = async (key: string) => {
    const target = images.find((img) => img.key === key);
    if (!target) return;
    setImageActionError('');
    if (target.existing) {
      const result = await deleteProductImage(target.existing.id, target.existing.storagePath, [
        target.existing.originalStoragePath,
        target.existing.brandingOverlayLogoPath,
      ]);
      if (result.error) {
        setImageActionError(result.error);
        return;
      }
    }
    const next = images.filter((img) => img.key !== key);
    setImages(next);
    persistExistingOrder(next);
  };

  const setPrimaryImage = (key: string) => {
    const img = images.find((i) => i.key === key);
    if (!img) return;
    const next = [img, ...images.filter((i) => i.key !== key)];
    setImages(next);
    persistExistingOrder(next);
  };

  // Opens the branding modal on the plain (un-composited) version of a
  // photo: a not-yet-uploaded item already has it locally (`originalFile`
  // if it was branded before, else `file` itself); an already-persisted
  // one has to be fetched back from Storage first since only its URL is
  // known client-side.
  const openBranding = async (item: MediaItem) => {
    setImageActionError('');
    if (item.file) {
      setBrandingBaseFile(item.originalFile ?? item.file);
      setBrandingTargetKey(item.key);
      return;
    }
    if (item.existing) {
      setBrandingLoading(true);
      try {
        const sourceUrl = item.existing.originalStoragePath ? resolveImageUrl(item.existing.originalStoragePath) : item.previewUrl;
        const res = await fetch(sourceUrl);
        const blob = await res.blob();
        setBrandingBaseFile(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
        setBrandingTargetKey(item.key);
      } catch {
        setImageActionError('Impossible de charger la photo pour appliquer le logo.');
      } finally {
        setBrandingLoading(false);
      }
    }
  };

  // Applying a logo to an already-persisted photo deletes that row/files
  // immediately (same "immediate" pattern as removeImage) and turns the
  // item into a fresh not-yet-uploaded one carrying the composite — it's
  // inserted as new, in the same array position, when the form is saved.
  const handleBrandingConfirm = async (result: OverlayResult) => {
    const target = images.find((i) => i.key === brandingTargetKey);
    if (!target) return;
    const compositeFile = new File([result.compositeBlob], `photo-branded-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const originalFile = brandingBaseFile ?? target.originalFile ?? target.file;
    if (target.existing) {
      const del = await deleteProductImage(target.existing.id, target.existing.storagePath, [
        target.existing.originalStoragePath,
        target.existing.brandingOverlayLogoPath,
      ]);
      if (del.error) {
        setImageActionError(del.error);
        setBrandingTargetKey(null);
        setBrandingBaseFile(null);
        return;
      }
    }
    setImages((prev) => prev.map((img) => (img.key === target.key ? {
      ...img,
      previewUrl: URL.createObjectURL(compositeFile),
      file: compositeFile,
      originalFile: originalFile ?? undefined,
      logoFile: result.logoFile,
      brandingOverlay: result.overlay,
      existing: undefined,
    } : img)));
    setBrandingTargetKey(null);
    setBrandingBaseFile(null);
  };

  // Replace-with-a-new-file and re-crop-the-current-photo both end up doing
  // the same thing: open the crop modal on some source file, then swap the
  // item's content for whatever comes out of it. They share this one
  // target/source pair and confirm/cancel pair rather than duplicating the
  // "delete old persisted row, then splice in a fresh local item" logic
  // twice.
  const [recropTargetKey, setRecropTargetKey] = useState<string | null>(null);
  const [recropSourceFile, setRecropSourceFile] = useState<File | null>(null);
  const [recropLoading, setRecropLoading] = useState(false);

  const openRecrop = async (item: MediaItem) => {
    setImageActionError('');
    if (item.file) {
      setRecropSourceFile(item.file);
      setRecropTargetKey(item.key);
      return;
    }
    if (item.existing) {
      setRecropLoading(true);
      try {
        const res = await fetch(item.previewUrl);
        const blob = await res.blob();
        setRecropSourceFile(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
        setRecropTargetKey(item.key);
      } catch {
        setImageActionError('Impossible de charger la photo pour la recadrer.');
      } finally {
        setRecropLoading(false);
      }
    }
  };

  // "Remplacer" picks a brand-new file, then routes it through the same
  // crop step as any newly-added photo before it replaces the old content.
  const handleReplaceFile = (key: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageActionError('');
    setRecropSourceFile(file);
    setRecropTargetKey(key);
  };

  // Confirming either flow deletes the old persisted row/files immediately
  // (a re-crop or a replacement both change storage_path's actual content,
  // so the old object can never be kept) and turns the item into a fresh
  // not-yet-uploaded one — inserted as new, in the same array position, on
  // save. Any prior branding is dropped: the vendor re-applies the logo
  // (Sparkles button) if they still want it on the new crop.
  const handleRecropConfirm = async (blob: Blob) => {
    const target = images.find((i) => i.key === recropTargetKey);
    if (!target) { setRecropTargetKey(null); setRecropSourceFile(null); return; }
    const newFile = new File([blob], `photo-${Date.now()}.webp`, { type: blob.type || 'image/webp' });
    if (target.existing) {
      const del = await deleteProductImage(target.existing.id, target.existing.storagePath, [
        target.existing.originalStoragePath,
        target.existing.brandingOverlayLogoPath,
      ]);
      if (del.error) {
        setImageActionError(del.error);
        setRecropTargetKey(null);
        setRecropSourceFile(null);
        return;
      }
    }
    setImages((prev) => prev.map((img) => (img.key === target.key ? {
      ...img,
      previewUrl: URL.createObjectURL(newFile),
      file: newFile,
      originalFile: undefined,
      logoFile: undefined,
      brandingOverlay: undefined,
      existing: undefined,
    } : img)));
    setRecropTargetKey(null);
    setRecropSourceFile(null);
  };
  const handleRecropCancel = () => { setRecropTargetKey(null); setRecropSourceFile(null); };

  const toggleSingleChoice = (groupId: string, value: string) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      const next: OptionSelection = { ...prev, [groupId]: current[0] === value ? [] : [value] };
      // Changing "Type de produit" invalidates choices tied to the previous
      // type: maquillage shades depend on it, so does everything shown for
      // Encens & Parfums de maison (Type/Volume/Notes vary per type — e.g.
      // never leave "Gowé" saved after switching to Parfum d'ambiance), and
      // so does Longueur/Forme/Style for Manucure & Pédicure (never leave
      // "Carré" saved after switching away from Faux ongles).
      if (groupId === 'typeproduit') {
        next.couleur = [];
        if (isEncensMaison) {
          next.typeencens = [];
          next.volume = [];
          next.notesambiance = [];
        }
        if (isManucurePedicure) {
          next.longueurongles = [];
          next.formeongles = [];
          next.styleongles = [];
        }
      }
      return next;
    });
    if (groupId === 'typeproduit') {
      setComboData({});
      if (isEncensMaison) setCustomVolumeMl('');
    }
  };

  const toggleMultiChoice = (groupId: string, value: string) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      return {
        ...prev,
        [groupId]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  };

  const updateComboStock = (key: string, stock: number) => {
    setComboData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { stock: 0, price: parseInt(price) || 0 }), stock: Math.max(0, stock) },
    }));
  };

  const updateComboPrice = (key: string, priceVal: number) => {
    setComboData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { stock: 0, price: 0 }), price: Math.max(0, priceVal) },
    }));
  };

  // When category/subcategory changes, reset selections
  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    setSubId('');
    setSelections({});
    setComboData({});
    setShowAllColors({});
    setCustomVolumeMl('');
  };

  const handleSubCategoryChange = (newSubId: string) => {
    setSubId(newSubId);
    setSelections({});
    setComboData({});
    setCustomVolumeMl('');
  };

  // Returns the error map directly (not just a boolean) so the caller can
  // build a clear, visible summary of exactly which field is blocking
  // submission — the previous inline-only errors were easy to miss on a
  // long, scrollable form, making a correctly-working "Publier" button
  // look broken when a required field above the fold was simply empty.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!categoryId) e.category = 'Veuillez choisir une catégorie';
    if (!name.trim()) e.name = 'Le nom du produit est obligatoire';
    if (!description.trim()) e.description = 'La description est obligatoire';
    if (!price || parseInt(price) <= 0) e.price = 'Le prix est obligatoire';
    if (isPromo) {
      const promo = parseInt(promoPrice) || 0;
      const base = parseInt(price) || 0;
      if (!promoPrice || promo <= 0) e.promoPrice = 'Le prix promotionnel est obligatoire.';
      else if (base > 0 && promo >= base) e.promoPrice = 'Le prix promotionnel doit être inférieur au prix de base.';
      if (promoStart && promoEnd && promoStart > promoEnd) e.promoEnd = 'La date de fin doit être après la date de début.';
    }
    if (!images.some((img) => img.kind === 'image')) e.images = 'Ajoutez au moins une photo.';
    setErrors(e);
    return e;
  };

  // Only the true variant dimensions (multiChoiceGroups) become
  // product_variants rows; everything else is descriptive-only. Recomputed
  // here (rather than reused from the `combinations` memo) so each combo's
  // parts can be paired back up with the group that produced them — needed
  // to build `attributes` keyed by the group's visible label, e.g.
  // {"Taille":"M","Couleur":"Noir"}.
  const buildVariantRows = (): { attributes: Record<string, string>; price: number; stock: number }[] => {
    const basePrice = parseInt(price) || 0;
    const selectedMulti = multiChoiceGroups
      .map((g) => ({ group: g, values: effectiveValues(g.id) }))
      .filter((s) => s.values.length > 0);

    // No variant dimension selected: still one product_variants row, with
    // empty attributes and the base price/stock — never left without a row.
    if (selectedMulti.length === 0) {
      return [{ attributes: {}, price: basePrice, stock: Math.max(0, parseInt(simpleStock) || 0) }];
    }

    let combos: string[][] = selectedMulti[0].values.map((v) => [v]);
    for (let i = 1; i < selectedMulti.length; i++) {
      const next: string[][] = [];
      for (const c of combos) {
        for (const val of selectedMulti[i].values) next.push([...c, val]);
      }
      combos = next;
    }

    return combos.map((parts) => {
      const key = parts.join('|');
      const attributes: Record<string, string> = {};
      selectedMulti.forEach((s, i) => { attributes[s.group.label] = parts[i]; });
      return {
        attributes,
        // "Le prix change selon les options" OFF → every row gets base_price,
        // regardless of any stale per-combo price left from when it was ON.
        price: priceByOption ? (comboData[key]?.price ?? basePrice) : basePrice,
        stock: comboData[key]?.stock ?? 0,
      };
    });
  };

  // Descriptive-only groups (style, type, matière, texture...) — saved for
  // display, but never split into stock lines.
  const buildDescriptiveAttributes = (): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const g of optionGroups) {
      if (VARIANT_DIMENSION_IDS.has(g.id)) continue;
      const values = effectiveValues(g.id);
      if (values.length > 0) result[g.label] = values;
    }
    if (showsNotes && notesInput.trim()) {
      const notes = notesInput.split(',').map((n) => n.trim()).filter(Boolean);
      if (notes.length > 0) result['Notes'] = notes;
    }
    return result;
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      // Shown right above the action buttons (via submitError) instead of
      // only inline next to each field — the field itself may be scrolled
      // out of view, which previously made a correctly-blocked submit look
      // like the button was simply unresponsive.
      const missing = Object.keys(validationErrors).map((key) => VALIDATION_FIELD_LABELS[key] ?? key);
      setSubmitError(`Impossible d'enregistrer : vérifiez ${missing.join(', ')}.`);
      return;
    }
    if (!sellerSupabaseShopId) {
      setSubmitError("Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.");
      return;
    }
    setSubmitError('');
    setIsSaving(true);
    // finally guarantees isSaving is always cleared — including on an
    // unexpected exception — so the button can never stay stuck on
    // "Enregistrement…" forever after a transient failure.
    try {
      // Build variant definitions for the local mock record too —
      // descriptive attributes (besoin, famille, style...) are saved there
      // as well, just never split into stock lines.
      const variantDefs = optionGroups.map((g) => ({
        name: g.label,
        values: effectiveValues(g.id),
      }));

      // localImages feeds the seller's own local mock product record (used
      // by the Pro product list UI only) — videos are excluded since it's
      // rendered as plain <img> thumbnails there, exactly like the public
      // catalog's `images: string[]` excludes them for the same reason.
      const localImages = images.filter((img) => img.kind === 'image').map((img) => img.previewUrl);
      const toNewMedia = (img: MediaItem): NewProductMedia => ({
        file: img.file as File,
        mediaType: img.kind,
        originalFile: img.originalFile,
        logoFile: img.logoFile,
        brandingOverlay: img.brandingOverlay,
      });
      // Position in the FULL media array, not just among new items — a
      // reordered or branding-replaced item can land anywhere relative to
      // already-persisted photos, so sort_order/is_primary must reflect its
      // real index, never an assumed "appended at the end" range.
      const newMediaWithPosition = images
        .map((img, i) => (img.file ? { media: toNewMedia(img), sortOrder: i, isPrimary: i === 0 } : null))
        .filter((x): x is { media: NewProductMedia; sortOrder: number; isPrimary: boolean } => Boolean(x));

      const promoPayload = {
        isPromo,
        promoPrice: isPromo ? (parseInt(promoPrice) || 0) : null,
        promoStart: isPromo && promoStart ? promoStart : null,
        promoEnd: isPromo && promoEnd ? promoEnd : null,
      };

      if (existingProductId) {
        // === True edit: UPDATE the same products row — same id, same
        // reference, same shop_id, all three left untouched by the update
        // itself. Variants are replaced wholesale with the current set;
        // photo add/remove already happened immediately elsewhere.
        const updateResult = await updateProductInSupabase(existingProductId, {
          name: name.trim(),
          description: description.trim(),
          category: categoryId,
          subcategory: subId,
          basePrice: parseInt(price) || 0,
          status: SUPABASE_STATUS_FOR_FORM_STATUS[status],
          descriptiveAttributes: buildDescriptiveAttributes(),
          variants: buildVariantRows(),
          ...promoPayload,
        });
        if (updateResult.error) {
          setSubmitError(updateResult.error);
          return;
        }

        if (newMediaWithPosition.length > 0) {
          const imagesResult = await addProductMedia(existingProductId, newMediaWithPosition);
          if (imagesResult.error) {
            setSubmitError(imagesResult.error);
            return;
          }
        }

        updateSellerProduct(existingProductId, {
          id: existingProductId,
          reference: existingReference,
          name: name.trim(),
          shopId: sellerSupabaseShopId,
          category: selectedCategory?.label ?? categoryId,
          price: parseInt(price) || 0,
          image: localImages[0] ?? '',
          images: localImages,
          stock: totalStock,
          status,
          variants: variantDefs.filter((v) => v.values.length > 0),
          description: description.trim(),
          supabaseProductId: existingProductId,
        });
      } else {
        const supabaseResult = await createProductInSupabase({
          shopId: sellerSupabaseShopId,
          shopName: sellerShopName,
          name: name.trim(),
          description: description.trim(),
          category: categoryId,
          subcategory: subId,
          basePrice: parseInt(price) || 0,
          status: SUPABASE_STATUS_FOR_FORM_STATUS[status],
          descriptiveAttributes: buildDescriptiveAttributes(),
          variants: buildVariantRows(),
          images: newMediaWithPosition.map((x) => x.media),
          ...promoPayload,
        });
        if ('error' in supabaseResult) {
          setSubmitError(supabaseResult.error);
          return;
        }

        const product = {
          id: `p${Date.now()}`,
          name: name.trim(),
          shopId: sellerSupabaseShopId,
          category: selectedCategory?.label ?? categoryId,
          price: parseInt(price),
          image: localImages[0] ?? '',
          stock: totalStock,
          status,
          variants: variantDefs.filter((v) => v.values.length > 0),
          description: description.trim(),
          supabaseProductId: supabaseResult.productId,
        };
        addSellerProduct({ ...product, images: localImages }, supabaseResult.reference);
      }

      navigate('/seller/produits');
    } finally {
      setIsSaving(false);
    }
  };

  // === Color swatch rendering ===

  const renderColorSwatches = (group: FilterGroup) => {
    const selected = selections[group.id] ?? [];
    const showAll = showAllColors[group.id] ?? false;
    const availableColors = group.options
      .map((name) => getColor(name))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    const visible = showAll ? availableColors : availableColors.slice(0, COLOR_PREVIEW_COUNT);

    return (
      <div>
        <div className="flex flex-wrap gap-2.5">
          {visible.map((color) => {
            const isSelected = selected.includes(color.name);
            return (
              <button
                key={color.name}
                type="button"
                onClick={() => toggleMultiChoice(group.id, color.name)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span
                  className={`h-10 w-10 rounded-full transition-all ${isSelected ? 'ring-2 ring-burgundy ring-offset-2' : 'ring-1 ring-line group-hover:ring-ink/20'} ${color.light ? 'border border-line' : ''}`}
                  style={color.multi
                    ? { background: 'conic-gradient(from 0deg, #e0507a, #f4d03f, #2b6cb0, #1c8a5b, #e0507a)' }
                    : { backgroundColor: color.hex }}
                />
                <span className={`text-[11px] ${isSelected ? 'font-medium text-burgundy' : 'text-ink/55'}`}>{color.name}</span>
              </button>
            );
          })}
        </div>
        {!showAll && availableColors.length > COLOR_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllColors((prev) => ({ ...prev, [group.id]: true }))}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-burgundy hover:underline"
          >
            Voir plus de couleurs <ChevronDown size={13} />
          </button>
        )}
      </div>
    );
  };

  // === Chip rendering for single/multiple choice ===

  const renderChips = (group: FilterGroup, isSingle: boolean) => {
    const selected = selections[group.id] ?? [];

    return (
      <div className="flex flex-wrap gap-2">
        {group.options.map((opt) => (
          <SelectableChip
            key={opt}
            label={opt}
            selected={selected.includes(opt)}
            onClick={() => (isSingle ? toggleSingleChoice(group.id, opt) : toggleMultiChoice(group.id, opt))}
          />
        ))}
      </div>
    );
  };

  // === Stock matrix rendering ===
  // Supports any number of active variant dimensions: 1 dimension renders a
  // flat list, 2+ dimensions group by one outer dimension (color first, if
  // present) and list the remaining dimensions' combination on each row.

  const renderStockMatrix = () => {
    if (combinations.length === 0) return null;

    const activeGroups = multiChoiceGroups.filter((g) => effectiveValues(g.id).length > 0);

    if (activeGroups.length === 1) {
      return (
        <div className="space-y-2.5">
          {combinations.map((combo) => (
            <div key={combo.key} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-ink min-w-0">{combo.label}</span>
              {priceByOption && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    className="input-field w-24 text-xs py-1.5"
                    placeholder="Prix"
                    value={comboData[combo.key]?.price ?? ''}
                    onChange={(e) => updateComboPrice(combo.key, parseInt(e.target.value) || 0)}
                  />
                  <span className="text-[11px] text-ink/40">FCFA</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  className="input-field w-16 text-center text-sm py-1.5"
                  placeholder="0"
                  value={comboData[combo.key]?.stock ?? ''}
                  onChange={(e) => updateComboStock(combo.key, parseInt(e.target.value) || 0)}
                />
                <span className="text-[11px] text-ink/40">stock</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // 2+ dimensions: group rows by one outer dimension (prefer color).
    const colorGroup = activeGroups.find((g) => COLOR_GROUP_IDS.has(g.id));
    const outerGroup = colorGroup ?? activeGroups[0];
    const outerValues = effectiveValues(outerGroup.id);

    return (
      <div className="space-y-4">
        {outerValues.map((outerVal) => {
          const rowsForOuter = combinations.filter((c) => c.parts.includes(outerVal));
          return (
            <div key={outerVal}>
              <p className="text-xs font-semibold text-ink mb-2 flex items-center gap-2">
                {COLOR_GROUP_IDS.has(outerGroup.id) && (() => {
                  const c = getColor(outerVal);
                  return c ? <span className="h-3.5 w-3.5 rounded-full border border-line" style={c.multi ? { background: 'conic-gradient(from 0deg, #e0507a, #f4d03f, #2b6cb0, #1c8a5b, #e0507a)' } : { backgroundColor: c.hex }} /> : null;
                })()}
                {outerVal}
              </p>
              <div className="space-y-2 ml-5">
                {rowsForOuter.map((combo) => {
                  const innerLabel = combo.parts.filter((p) => p !== outerVal).join(' / ');
                  return (
                    <div key={combo.key} className="flex items-center gap-3">
                      <span className="flex-1 text-sm text-ink/70 min-w-0">{innerLabel}</span>
                      {priceByOption && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number"
                            className="input-field w-24 text-xs py-1.5"
                            placeholder="Prix"
                            value={comboData[combo.key]?.price ?? ''}
                            onChange={(e) => updateComboPrice(combo.key, parseInt(e.target.value) || 0)}
                          />
                          <span className="text-[11px] text-ink/40">FCFA</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                          type="number"
                          className="input-field w-16 text-center text-sm py-1.5"
                          placeholder="0"
                          value={comboData[combo.key]?.stock ?? ''}
                          onChange={(e) => updateComboStock(combo.key, parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const nameExample = (subId && examplesBySubcategory[`${categoryId}/${subId}`]?.name) || (categoryId && examplesByCategory[categoryId]?.name) || 'Ex. Nom du produit';
  const descriptionExample = (subId && examplesBySubcategory[`${categoryId}/${subId}`]?.description) || (categoryId && examplesByCategory[categoryId]?.description) || 'Ex. Décrivez le produit : matière, usage, points forts…';

  const backButton = (
    <button onClick={() => navigate('/seller/produits')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
      <ArrowLeft size={16} /> Produits
    </button>
  );

  if (isEditing && loadingExisting) {
    return (
      <div className="space-y-5">
        {backButton}
        <div className="card p-10 text-center text-sm text-ink/50">Chargement du produit…</div>
      </div>
    );
  }

  if (isEditing && loadError) {
    return (
      <div className="space-y-5">
        {backButton}
        <div className="card p-10 text-center text-sm text-burgundy">{loadError}</div>
      </div>
    );
  }

  // In edit mode, an already-published (active) product keeps "Publier" as
  // a confusing label for a save that isn't really publishing anything new
  // — "Enregistrer les modifications" better matches what's happening.
  const primaryLabel = isSaving ? 'Enregistrement…' : (isEditing && existingStatus === 'active') ? 'Enregistrer les modifications' : 'Publier';

  return (
    <div className="space-y-5">
      {backButton}

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">{isEditing ? 'Modifier le produit' : 'Ajouter un produit'}</h1>
        {isEditing && existingReference && <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-mono font-medium text-ink/60">Réf. {existingReference}</span>}
      </div>

      {latestModeration && <VendorNoticeBanner entry={latestModeration} />}

      {/* 1. Catégorie */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Catégorie</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Choisir une catégorie</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <SelectableChip key={c.id} label={c.label} selected={categoryId === c.id} onClick={() => handleCategoryChange(c.id)} />
            ))}
          </div>
          {errors.category && <p className="mt-1 text-xs text-burgundy">{errors.category}</p>}
        </div>
        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Sous-catégorie</label>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.subcategories.map((s) => (
                <SelectableChip key={s.id} label={s.label} selected={subId === s.id} onClick={() => handleSubCategoryChange(s.id)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Nom + 4. Description */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Informations du produit</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom du produit</label>
          <input className="input-field" placeholder={nameExample} value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p className="mt-1 text-xs text-burgundy">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
          <textarea className="input-field" rows={3} placeholder={descriptionExample} value={description} onChange={(e) => setDescription(e.target.value)} />
          {errors.description && <p className="mt-1 text-xs text-burgundy">{errors.description}</p>}
        </div>
      </div>

      {/* 5. Photos & vidéo */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Photos et vidéo du produit</h2>
          <p className="mt-1 text-xs text-ink/45">
            Jusqu'à {MAX_PRODUCT_MEDIA_ITEMS} photos et {MAX_PRODUCT_VIDEOS} vidéo par produit — y compris les photos déjà enregistrées. Flèches : réordonner. Étoile : photo principale. Recadrer : repositionner/zoomer. Remplacer : envoyer une nouvelle photo. Logo : superposer votre marque.
          </p>
        </div>

        {/* Each photo/video is a full card, not a small overlaid thumbnail —
            every action below is its own >=44x44px tap target with a
            visible label (touch has no hover, so a title-only tooltip is
            not enough on mobile/tablet). */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, i) => (
              <div key={img.key} className="rounded-xl border border-line bg-white p-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
                    {img.kind === 'video' ? (
                      <video src={img.previewUrl} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      <img src={img.previewUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{img.kind === 'video' ? 'Vidéo' : `Photo ${i + 1}`}</p>
                    {i === 0 && img.kind === 'image' && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-burgundy"><Star size={11} fill="currentColor" /> Photo principale</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(img.key, -1)}
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
                    >
                      <ArrowUp size={16} /> Avant
                    </button>
                  )}
                  {i < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(img.key, 1)}
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
                    >
                      <ArrowDown size={16} /> Après
                    </button>
                  )}
                  {i !== 0 && img.kind === 'image' && (
                    <button
                      type="button"
                      onClick={() => setPrimaryImage(img.key)}
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors"
                    >
                      <Star size={16} /> Principale
                    </button>
                  )}
                  {img.kind === 'image' && (
                    <>
                      <button
                        type="button"
                        onClick={() => openRecrop(img)}
                        disabled={recropLoading}
                        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors disabled:opacity-50"
                      >
                        <Crop size={16} /> Recadrer
                      </button>
                      <label className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors">
                        <RefreshCw size={16} /> Remplacer
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleReplaceFile(img.key, e.target.files); e.target.value = ''; }} />
                      </label>
                      <button
                        type="button"
                        onClick={() => openBranding(img)}
                        disabled={brandingLoading}
                        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink/60 hover:border-burgundy/30 hover:text-burgundy transition-colors disabled:opacity-50"
                      >
                        <Sparkles size={16} /> Logo
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(img.key)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-burgundy/70 hover:border-burgundy/40 hover:text-burgundy transition-colors"
                  >
                    <X size={16} /> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {imageActionError && <p className="text-xs text-burgundy">{imageActionError}</p>}

        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line cursor-pointer hover:border-burgundy/30 transition-colors py-6">
            <Camera size={22} className="text-ink/30" />
            <span className="mt-2 text-sm font-medium text-ink/60">Ajouter des photos</span>
            <span className="mt-0.5 text-xs text-ink/35">{images.length}/{MAX_PRODUCT_MEDIA_ITEMS} médias</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleAddFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <label className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line py-6 transition-colors ${videoCount >= MAX_PRODUCT_VIDEOS ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-burgundy/30'}`}>
            <Video size={22} className="text-ink/30" />
            <span className="mt-2 text-sm font-medium text-ink/60">Ajouter une vidéo</span>
            <span className="mt-0.5 text-xs text-ink/35">MP4/WebM/MOV, {MAX_VIDEO_SIZE_MB} Mo max</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={videoCount >= MAX_PRODUCT_VIDEOS} className="hidden" onChange={(e) => { handleAddVideo(e.target.files); e.target.value = ''; }} />
          </label>
        </div>

        {errors.images && <p className="text-xs text-burgundy">{errors.images}</p>}
        {images.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-line">
            <p className="text-xs text-ink/35 flex items-center gap-1.5"><Package size={14} /> Ajoutez au moins une image</p>
          </div>
        )}
      </div>

      {pendingCropFiles[0] && (
        <ImageCropModal file={pendingCropFiles[0]} onCancel={handleCropCancel} onConfirm={handleCropConfirm} />
      )}
      {brandingTargetKey && brandingBaseFile && (
        <LogoOverlayModal baseFile={brandingBaseFile} onCancel={() => { setBrandingTargetKey(null); setBrandingBaseFile(null); }} onConfirm={handleBrandingConfirm} />
      )}
      {recropTargetKey && recropSourceFile && (
        <ImageCropModal file={recropSourceFile} onCancel={handleRecropCancel} onConfirm={handleRecropConfirm} />
      )}

      {/* 6. Prix de base */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Prix de base</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Prix (FCFA)</label>
          <input className="input-field" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          {errors.price && <p className="mt-1 text-xs text-burgundy">{errors.price}</p>}
        </div>
        <label className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setPriceByOption(!priceByOption)}
            className={`relative h-6 w-11 rounded-full transition-colors ${priceByOption ? 'bg-burgundy' : 'bg-ink/15'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${priceByOption ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-ink/70">Le prix change selon les options</span>
        </label>
      </div>

      {/* 6bis. Promotion */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Promotion</h2>
          <button
            type="button"
            onClick={() => setIsPromo(!isPromo)}
            className={`relative h-6 w-11 rounded-full transition-colors ${isPromo ? 'bg-burgundy' : 'bg-ink/15'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isPromo ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {isPromo && (
          <div className="space-y-4 fade-in">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Prix promotionnel (FCFA)</label>
              <input className="input-field" type="number" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} />
              {errors.promoPrice && <p className="mt-1 text-xs text-burgundy">{errors.promoPrice}</p>}
            </div>
            {(() => {
              const base = parseInt(price) || 0;
              const promo = parseInt(promoPrice) || 0;
              const disc = discountPercent(promo, base);
              return disc ? (
                <p className="text-sm text-ink/70">
                  <span className="text-ink/40 line-through">{base.toLocaleString('fr-FR')} FCFA</span>{' '}
                  <span className="font-semibold text-ink">{promo.toLocaleString('fr-FR')} FCFA</span>{' '}
                  <span className="rounded-full bg-burgundy/8 px-2 py-0.5 text-xs font-semibold text-burgundy">-{disc}%</span>
                </p>
              ) : null;
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Début (optionnel)</label>
                <input type="date" className="input-field" value={promoStart} onChange={(e) => setPromoStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Fin (optionnel)</label>
                <input type="date" className="input-field" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} />
                {errors.promoEnd && <p className="mt-1 text-xs text-burgundy">{errors.promoEnd}</p>}
              </div>
            </div>
            <p className="text-xs text-ink/40">Sans dates, la promotion reste active tant qu'elle n'est pas désactivée.</p>
          </div>
        )}
      </div>

      {/* 7. Options du produit */}
      {optionGroups.length > 0 && (
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-ink">Options du produit</h2>
            <p className="mt-1 text-xs text-ink/45">Sélectionnez les options disponibles pour ce produit. Ezial génère automatiquement les combinaisons de stock pour les options qui créent une vraie variante (taille, couleur, volume...).</p>
          </div>

          {optionGroups.map((group) => {
            const isColor = COLOR_GROUP_IDS.has(group.id);
            const isSingle = SINGLE_CHOICE_IDS.has(group.id) && !isVetementsFemmeTypeGroup(categoryId, subId, group.id);
            const choiceLabel = isSingle ? 'Choix unique' : 'Choix multiple';
            const showsCustomVolume = group.id === 'volume' && (selections.volume ?? []).includes('Autre');

            return (
              <div key={group.id} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-ink">{group.label}</label>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isSingle ? 'bg-blue-50 text-blue-600' : 'bg-burgundy/10 text-burgundy'}`}>
                    {choiceLabel}
                  </span>
                </div>
                {isColor
                  ? renderColorSwatches(group)
                  : renderChips(group, isSingle)}
                {showsCustomVolume && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min="1"
                      className="input-field w-28"
                      placeholder="Volume"
                      value={customVolumeMl}
                      onChange={(e) => setCustomVolumeMl(e.target.value)}
                    />
                    <span className="text-xs text-ink/50">ml</span>
                  </div>
                )}
              </div>
            );
          })}

          {showsNotes && (
            <div className="space-y-2.5">
              <label className="text-sm font-medium text-ink">Notes</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex. caramel, vanille fouettée, cassonade"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
              />
              <p className="text-xs text-ink/45">Séparez les notes principales par des virgules. Purement descriptif — ne crée aucune variante.</p>
            </div>
          )}
        </div>
      )}

      {/* 8. Stock */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">En stock</h2>
          {combinations.length > 0 && <span className="text-xs text-ink/50">Total : <span className="font-semibold text-ink">{totalStock}</span></span>}
        </div>

        {combinations.length > 0 ? (
          <>
            {priceByOption && (
              <div className="flex items-center gap-4 text-[11px] text-ink/40 border-b border-line pb-2">
                <span className="w-24">Prix (FCFA)</span>
                <span>Stock</span>
              </div>
            )}
            {renderStockMatrix()}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink/60 flex-1">Quantité disponible</label>
            <input
              type="number"
              min="0"
              className="input-field w-24 text-center"
              placeholder="0"
              value={simpleStock}
              onChange={(e) => setSimpleStock(e.target.value)}
            />
          </div>
        )}
      </div>

      {!sellerSupabaseShopId && (
        <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">
          Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL avant de publier un produit.
        </p>
      )}
      {submitError && <p className="rounded-lg bg-burgundy/5 px-4 py-3 text-sm text-burgundy">{submitError}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => handleSubmit('draft')} disabled={isSaving} className="btn-outline flex-1">{isSaving ? 'Enregistrement…' : 'Enregistrer en brouillon'}</button>
        <button onClick={() => handleSubmit('published')} disabled={isSaving} className="btn-primary flex-1">{primaryLabel}</button>
      </div>
    </div>
  );
}
