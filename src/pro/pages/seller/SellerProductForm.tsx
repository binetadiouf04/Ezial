import { useState, useMemo, useEffect } from 'react';
import { usePro } from '../../ProContext';
import { categories, categoryMap, type CategoryId } from '@/data/categories';
import { getFilters, type FilterGroup } from '@/data/filters';
import { getColor } from '@/data/colors';
import VendorNoticeBanner from '../../components/VendorNoticeBanner';
import { createProductInSupabase, fetchProductImages, deleteProductImage, addProductImages, type SupabaseProductStatus } from '@/lib/supabaseSellerProducts';

// products.status in Supabase only accepts draft/active/flagged/disabled —
// there is no 'published' value there. The form's own draft/published
// choice (used everywhere else in the local mock product model) is mapped
// to the Supabase-accepted value only at the point of writing to Supabase.
const SUPABASE_STATUS_FOR_FORM_STATUS: Record<'draft' | 'published', SupabaseProductStatus> = {
  draft: 'draft',
  published: 'active',
};
import { ArrowLeft, X, Package, ChevronDown, Check, Camera, Star } from 'lucide-react';

// Which filter groups are single-choice (radio-like) vs descriptive multi-choice
// (checkbox-like, but never split stock) vs true variant dimensions (checkbox-like
// AND generate one stock/price line per selected value).
const SINGLE_CHOICE_IDS = new Set(['type', 'style', 'texture', 'matiere', 'peau', 'typeproduit']);
// Only these represent a genuinely different version of the product being sold —
// the ones allowed to generate stock/price combinations. Descriptive multi-choice
// attributes like "besoin" or "famille" (notes olfactives) are intentionally left
// out: several can apply at once, but they only describe the product and must
// never split it into separate stock lines.
const VARIANT_DIMENSION_IDS = new Set(['taille', 'couleur', 'longueur', 'densite', 'volume', 'poids']);
const COLOR_GROUP_IDS = new Set(['couleur']);

// Number of colors to show before "Voir plus"
const COLOR_PREVIEW_COUNT = 8;

const VOLUME_BASE_OPTIONS = ['30 ml', '50 ml', '100 ml', 'Autre'];
const WEIGHT_BASE_OPTIONS = ['150 g', '300 g', 'Autre'];

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

// One photo in the form's gallery. `existing` is present only for a photo
// already persisted as a Supabase product_images row (needed to delete the
// right Storage object + row if removed); `file` is present only for a
// newly-selected, not-yet-uploaded photo.
interface ImageItem {
  key: string;
  previewUrl: string;
  file?: File;
  existing?: { id: string; storagePath: string };
}

export default function SellerProductForm({ productId }: { productId?: string }) {
  const { navigate, sellerProducts, addSellerProduct, peekNextProductReference, updateSellerProduct, getLatestModeration, sellerSupabaseShopId } = usePro();
  const existing = productId ? sellerProducts.find((p) => p.id === productId) : undefined;
  const latestModeration = existing ? getLatestModeration('product', existing.id) : null;

  const [categoryId, setCategoryId] = useState<string>(existing?.category ?? '');
  const [subId, setSubId] = useState<string>('');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing?.price.toString() ?? '');
  // Photos already synced to Supabase are reloaded in full via the effect
  // below; a legacy (mock-only) product falls back to its single `image`.
  const [images, setImages] = useState<ImageItem[]>(
    existing && !existing.supabaseProductId ? [{ key: 'legacy-0', previewUrl: existing.image }] : [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageActionError, setImageActionError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!existing?.supabaseProductId) return;
    let cancelled = false;
    fetchProductImages(existing.supabaseProductId).then((rows) => {
      if (cancelled) return;
      setImages(rows.map((row) => ({ key: row.id, previewUrl: row.url, existing: { id: row.id, storagePath: row.storagePath } })));
    });
    return () => { cancelled = true; };
  }, [existing?.supabaseProductId]);

  // Options state: which values are selected per option group
  const [selections, setSelections] = useState<OptionSelection>({});
  const [showAllColors, setShowAllColors] = useState<Record<string, boolean>>({});

  // Manual value when "Autre" is picked for Volume / Poids
  const [customVolumeMl, setCustomVolumeMl] = useState('');
  const [customWeightG, setCustomWeightG] = useState('');

  // Price by option toggle
  const [priceByOption, setPriceByOption] = useState(false);

  // Stock + price per combination (used when the product has real variants)
  const [comboData, setComboData] = useState<Record<string, { stock: number; price: number }>>({});
  // Plain stock (used when the product has no variant dimension at all)
  const [simpleStock, setSimpleStock] = useState(existing?.stock.toString() ?? '');

  const selectedCategory = categoryId ? categoryMap[categoryId as CategoryId] : null;
  const selectedTypeProduit = selections.typeproduit?.[0];

  const showsVolume =
    (categoryId === 'beaute' && (subId === 'skincare' || subId === 'hygiene')) ||
    (categoryId === 'parfums' && (subId === 'parfums-femme' || subId === 'parfums-homme' || subId === 'huiles-brumes'));

  const showsWeight =
    categoryId === 'parfums' && subId === 'encens-parfums-maison' &&
    (selectedTypeProduit === 'Encens' || selectedTypeProduit === 'Cire parfumée');

  const isMakeup = categoryId === 'beaute' && subId === 'maquillage';

  const optionGroups: FilterGroup[] = useMemo(() => {
    if (!categoryId) return [];
    let groups = getFilters(categoryId, subId || undefined).filter((g) => g.id !== 'prix');

    if (isMakeup) {
      groups = groups.filter((g) => g.id !== 'couleur');
      const shades = selectedTypeProduit ? makeupColorsByType[selectedTypeProduit] : undefined;
      if (shades && shades.length > 0) {
        groups = [...groups, { id: 'couleur', label: 'Couleur / Teinte', options: shades, collapsible: true }];
      }
    }
    if (showsVolume) groups = [...groups, { id: 'volume', label: 'Volume', options: VOLUME_BASE_OPTIONS }];
    if (showsWeight) groups = [...groups, { id: 'poids', label: 'Poids', options: WEIGHT_BASE_OPTIONS }];

    return groups;
  }, [categoryId, subId, isMakeup, selectedTypeProduit, showsVolume, showsWeight]);

  // Only "true" variant dimensions (taille, couleur, volume, poids, longueur,
  // densité) generate stock/price combinations — everything else (style, type,
  // besoin, notes olfactives...) is purely descriptive.
  const multiChoiceGroups = optionGroups.filter((g) => VARIANT_DIMENSION_IDS.has(g.id));

  // "Autre" in Volume/Poids is replaced by the seller's manual value before it
  // ever reaches the combination logic or the saved product.
  const effectiveValues = (groupId: string): string[] => {
    const raw = selections[groupId] ?? [];
    if (groupId === 'volume') {
      return raw.map((v) => (v === 'Autre' ? (customVolumeMl.trim() ? `${customVolumeMl.trim()} ml` : '') : v)).filter(Boolean);
    }
    if (groupId === 'poids') {
      return raw.map((v) => (v === 'Autre' ? (customWeightG.trim() ? `${customWeightG.trim()} g` : '') : v)).filter(Boolean);
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
  }, [selections, multiChoiceGroups, comboData, price, customVolumeMl, customWeightG]);

  const totalStock = useMemo(() => {
    if (combinations.length > 0) {
      return combinations.reduce((sum, c) => sum + (comboData[c.key]?.stock ?? 0), 0);
    }
    return Math.max(0, parseInt(simpleStock) || 0);
  }, [combinations, comboData, simpleStock]);

  // === Handlers ===

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages: ImageItem[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      newImages.push({ key: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, previewUrl: URL.createObjectURL(file), file });
    });
    if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);
  };

  // Removing a photo that's already a real Supabase product_images row
  // deletes the Storage file + the row immediately — never left dangling.
  const removeImage = async (key: string) => {
    const target = images.find((img) => img.key === key);
    if (!target) return;
    setImageActionError('');
    if (target.existing) {
      const result = await deleteProductImage(target.existing.id, target.existing.storagePath);
      if (result.error) {
        setImageActionError(result.error);
        return;
      }
    }
    setImages((prev) => prev.filter((img) => img.key !== key));
  };

  const setPrimaryImage = (key: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.key === key);
      if (!img) return prev;
      return [img, ...prev.filter((i) => i.key !== key)];
    });
  };

  const toggleSingleChoice = (groupId: string, value: string) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      const next: OptionSelection = { ...prev, [groupId]: current[0] === value ? [] : [value] };
      // Changing "Type de produit" invalidates color/weight choices made for the
      // previous type (maquillage shades depend on it; encens' weight variant too).
      if (groupId === 'typeproduit') {
        next.couleur = [];
        next.poids = [];
      }
      return next;
    });
    if (groupId === 'typeproduit') setComboData({});
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
    setCustomWeightG('');
  };

  const handleSubCategoryChange = (newSubId: string) => {
    setSubId(newSubId);
    setSelections({});
    setComboData({});
    setCustomVolumeMl('');
    setCustomWeightG('');
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!categoryId) e.category = 'Veuillez choisir une catégorie';
    if (!name.trim()) e.name = 'Le nom du produit est obligatoire';
    if (!description.trim()) e.description = 'La description est obligatoire';
    if (!price || parseInt(price) <= 0) e.price = 'Le prix est obligatoire';
    if (images.length === 0) e.images = 'Ajoutez au moins une photo.';
    setErrors(e);
    return Object.keys(e).length === 0;
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
    return result;
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!validate()) return;
    if (!sellerSupabaseShopId) {
      setSubmitError("Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.");
      return;
    }
    setSubmitError('');
    setIsSaving(true);

    // Build variant definitions for the local mock record too — descriptive
    // attributes (besoin, famille, style...) are saved there as well, just
    // never split into stock lines.
    const variantDefs = optionGroups.map((g) => ({
      name: g.label,
      values: effectiveValues(g.id),
    }));

    const newLocalImages = images.filter((img): img is ImageItem & { file: File } => Boolean(img.file));

    if (existing?.supabaseProductId) {
      // Editing an already-Supabase-synced product: only new photos are
      // pushed to Supabase in this task's scope — product/variant fields
      // stay on the local mock record, exactly as before.
      if (newLocalImages.length > 0) {
        const sortOrderStart = images.length - newLocalImages.length;
        const result = await addProductImages(
          existing.supabaseProductId,
          newLocalImages.map((img) => ({ file: img.file })),
          sortOrderStart,
          sortOrderStart === 0,
        );
        if (result.error) {
          setSubmitError(result.error);
          setIsSaving(false);
          return;
        }
      }
    } else {
      const reference = existing?.reference ?? peekNextProductReference(sellerSupabaseShopId);
      const supabaseResult = await createProductInSupabase({
        shopId: sellerSupabaseShopId,
        reference,
        name: name.trim(),
        description: description.trim(),
        category: categoryId,
        subcategory: subId,
        basePrice: parseInt(price) || 0,
        status: SUPABASE_STATUS_FOR_FORM_STATUS[status],
        descriptiveAttributes: buildDescriptiveAttributes(),
        variants: buildVariantRows(),
        images: newLocalImages.map((img) => ({ file: img.file })),
      });
      if ('error' in supabaseResult) {
        setSubmitError(supabaseResult.error);
        setIsSaving(false);
        return;
      }

      const product = {
        id: existing?.id ?? `p${Date.now()}`,
        name: name.trim(),
        shopId: sellerSupabaseShopId,
        category: selectedCategory?.label ?? categoryId,
        price: parseInt(price),
        image: images[0]?.previewUrl ?? '',
        stock: totalStock,
        status,
        variants: variantDefs.filter((v) => v.values.length > 0),
        description: description.trim(),
        supabaseProductId: supabaseResult.productId,
      };
      const localImages = images.map((img) => img.previewUrl);
      if (existing) {
        updateSellerProduct(existing.id, { ...product, images: localImages, reference: existing.reference });
      } else {
        addSellerProduct({ ...product, images: localImages });
      }
    }

    setIsSaving(false);
    navigate('/seller/produits');
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

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/seller/produits')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Produits
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">{existing ? 'Modifier le produit' : 'Ajouter un produit'}</h1>
        {existing && <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-mono font-medium text-ink/60">Réf. {existing.reference}</span>}
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

      {/* 5. Photos */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Photos du produit</h2>
          <p className="mt-1 text-xs text-ink/45">Ajoutez des photos claires de votre produit. Vous pouvez sélectionner plusieurs photos — la première devient la photo principale, les autres forment la galerie. Ezial les adapte automatiquement à l'affichage, aucun format précis n'est requis.</p>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {images.map((img, i) => (
              <div key={img.key} className="relative group rounded-lg overflow-hidden bg-cream aspect-square">
                <img src={img.previewUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-burgundy px-1.5 py-0.5 text-[9px] font-medium text-white flex items-center gap-0.5">
                    <Star size={8} fill="white" /> Principale
                  </span>
                )}
                <div className="absolute top-1 right-1 flex gap-1">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => setPrimaryImage(img.key)}
                      className="rounded-full bg-white/90 p-1 text-ink/50 hover:text-burgundy transition-colors"
                      title="Définir comme photo principale"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(img.key)}
                    className="rounded-full bg-white/90 p-1 text-ink/50 hover:text-burgundy transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {imageActionError && <p className="text-xs text-burgundy">{imageActionError}</p>}

        <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line cursor-pointer hover:border-burgundy/30 transition-colors py-6">
          <Camera size={24} className="text-ink/30" />
          <span className="mt-2 text-sm font-medium text-ink/60">Ajouter des photos</span>
          <span className="mt-0.5 text-xs text-ink/35">Sélectionnez une ou plusieurs images</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleAddFiles(e.target.files)}
          />
        </label>

        {errors.images && <p className="text-xs text-burgundy">{errors.images}</p>}
        {images.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-line">
            <p className="text-xs text-ink/35 flex items-center gap-1.5"><Package size={14} /> Ajoutez au moins une image</p>
          </div>
        )}
      </div>

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

      {/* 7. Options du produit */}
      {optionGroups.length > 0 && (
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-ink">Options du produit</h2>
            <p className="mt-1 text-xs text-ink/45">Sélectionnez les options disponibles pour ce produit. Ezial génère automatiquement les combinaisons de stock pour les options qui créent une vraie variante (taille, couleur, volume, poids...).</p>
          </div>

          {optionGroups.map((group) => {
            const isColor = COLOR_GROUP_IDS.has(group.id);
            const isSingle = SINGLE_CHOICE_IDS.has(group.id);
            const choiceLabel = isSingle ? 'Choix unique' : 'Choix multiple';
            const showsCustomVolume = group.id === 'volume' && (selections.volume ?? []).includes('Autre');
            const showsCustomWeight = group.id === 'poids' && (selections.poids ?? []).includes('Autre');

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
                {showsCustomWeight && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min="1"
                      className="input-field w-28"
                      placeholder="Poids"
                      value={customWeightG}
                      onChange={(e) => setCustomWeightG(e.target.value)}
                    />
                    <span className="text-xs text-ink/50">g</span>
                  </div>
                )}
              </div>
            );
          })}
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
        <button onClick={() => handleSubmit('published')} disabled={isSaving} className="btn-primary flex-1">{isSaving ? 'Enregistrement…' : 'Publier'}</button>
      </div>
    </div>
  );
}
