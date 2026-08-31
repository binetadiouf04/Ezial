import { useState, useMemo } from 'react';
import { usePro } from '../../ProContext';
import { categories, categoryMap, type CategoryId } from '@/data/categories';
import { getFilters, type FilterGroup } from '@/data/filters';
import { colorPalette, getColor } from '@/data/colors';
import VendorNoticeBanner from '../../components/VendorNoticeBanner';
import { ArrowLeft, X, Package, ChevronDown, Check, Camera, Star } from 'lucide-react';

// Which filter groups are single-choice vs multiple-choice
const SINGLE_CHOICE_IDS = new Set(['type', 'style', 'texture', 'matiere', 'peau', 'typeproduit']);
const COLOR_GROUP_IDS = new Set(['couleur']);

// Number of colors to show before "Voir plus"
const COLOR_PREVIEW_COUNT = 8;

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

export default function SellerProductForm({ productId }: { productId?: string }) {
  const { navigate, sellerProducts, addSellerProduct, updateSellerProduct, getLatestModeration } = usePro();
  const existing = productId ? sellerProducts.find((p) => p.id === productId) : undefined;
  const latestModeration = existing ? getLatestModeration('product', existing.id) : null;

  const [categoryId, setCategoryId] = useState<string>(existing?.category ?? '');
  const [subId, setSubId] = useState<string>('');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing?.price.toString() ?? '');
  const [images, setImages] = useState<string[]>(existing ? [existing.image] : []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Options state: which values are selected per option group
  const [selections, setSelections] = useState<OptionSelection>({});
  const [showAllColors, setShowAllColors] = useState<Record<string, boolean>>({});

  // Price by option toggle
  const [priceByOption, setPriceByOption] = useState(false);

  // Stock + price per combination
  const [comboData, setComboData] = useState<Record<string, { stock: number; price: number }>>({});

  const selectedCategory = categoryId ? categoryMap[categoryId as CategoryId] : null;
  const optionGroups: FilterGroup[] = useMemo(() => {
    if (!categoryId) return [];
    return getFilters(categoryId, subId || undefined).filter((g) => g.id !== 'prix');
  }, [categoryId, subId]);

  // Determine which groups are "selectable" (generate stock combinations)
  // vs "descriptive" (single-choice attributes like type, style, matière)
  // Multiple-choice groups generate combinations. Single-choice groups are descriptive.
  // Exception: if there's only one multiple-choice group, it generates a simple stock list.
  const multiChoiceGroups = optionGroups.filter((g) => !SINGLE_CHOICE_IDS.has(g.id));
  const singleChoiceGroups = optionGroups.filter((g) => SINGLE_CHOICE_IDS.has(g.id));

  // Generate combinations from selected multiple-choice options
  const combinations: Combo[] = useMemo(() => {
    const selectedMulti = multiChoiceGroups
      .map((g) => ({ group: g, values: selections[g.id] ?? [] }))
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
  }, [selections, multiChoiceGroups, comboData, price]);

  const totalStock = useMemo(() => {
    if (combinations.length > 0) {
      return combinations.reduce((sum, c) => sum + (comboData[c.key]?.stock ?? 0), 0);
    }
    return 0;
  }, [combinations, comboData]);

  // === Handlers ===

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages: string[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      newImages.push(URL.createObjectURL(file));
    });
    if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const setPrimaryImage = (index: number) => {
    setImages((prev) => {
      const img = prev[index];
      return [img, ...prev.filter((_, i) => i !== index)];
    });
  };

  const toggleSingleChoice = (groupId: string, value: string) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      return { ...prev, [groupId]: current[0] === value ? [] : [value] };
    });
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
  };

  const handleSubCategoryChange = (newSubId: string) => {
    setSubId(newSubId);
    setSelections({});
    setComboData({});
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

  const handleSubmit = (status: 'draft' | 'pending') => {
    if (!validate()) return;

    // Build variant definitions for storage
    const variantDefs = optionGroups.map((g) => ({
      name: g.label,
      values: selections[g.id] ?? [],
    }));

    // Build combination-level data
    const comboEntries = combinations.map((c) => ({
      label: c.label,
      stock: comboData[c.key]?.stock ?? 0,
      price: priceByOption ? (comboData[c.key]?.price ?? (parseInt(price) || 0)) : (parseInt(price) || 0),
    }));

    const product = {
      id: existing?.id ?? `p${Date.now()}`,
      name: name.trim(),
      shopId: 'maison-fatou',
      category: selectedCategory?.label ?? categoryId,
      price: parseInt(price),
      image: images[0],
      stock: totalStock || parseInt('0'),
      status,
      variants: variantDefs.filter((v) => v.values.length > 0),
      description: description.trim(),
    };
    if (existing) {
      updateSellerProduct(existing.id, { ...product, images, reference: existing.reference });
    } else {
      addSellerProduct({ ...product, images });
    }
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
        {group.options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => isSingle ? toggleSingleChoice(group.id, opt) : toggleMultiChoice(group.id, opt)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-burgundy text-white border border-burgundy'
                  : 'bg-white border border-line text-ink/70 hover:border-ink/25 hover:text-ink'
              }`}
            >
              {opt}
              {isSelected && isSingle && <Check size={13} className="inline ml-1.5 -mt-0.5" />}
            </button>
          );
        })}
      </div>
    );
  };

  // === Stock matrix rendering ===

  const renderStockMatrix = () => {
    if (combinations.length === 0) return null;

    // Group combinations by first attribute for the 2D display
    // If only one dimension, it's a flat list
    if (multiChoiceGroups.filter((g) => (selections[g.id] ?? []).length > 0).length === 1) {
      // Simple flat list
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

    // Two-dimensional: group by first attribute
    const firstGroup = multiChoiceGroups.find((g) => (selections[g.id] ?? []).length > 0);
    const secondGroup = multiChoiceGroups.filter((g) => g !== firstGroup).find((g) => (selections[g.id] ?? []).length > 0);

    if (!firstGroup || !secondGroup) return null;

    const firstValues = selections[firstGroup.id] ?? [];
    const secondValues = selections[secondGroup.id] ?? [];

    // Determine which is the "row header" (grouped) — prefer color as the outer grouping
    const colorGroup = multiChoiceGroups.find((g) => COLOR_GROUP_IDS.has(g.id) && (selections[g.id] ?? []).length > 0);
    const outerGroup = colorGroup ?? firstGroup;
    const innerGroup = outerGroup === firstGroup ? secondGroup : firstGroup;
    const outerValues = selections[outerGroup.id] ?? [];
    const innerValues = selections[innerGroup.id] ?? [];

    return (
      <div className="space-y-4">
        {outerValues.map((outerVal) => (
          <div key={outerVal}>
            <p className="text-xs font-semibold text-ink mb-2 flex items-center gap-2">
              {COLOR_GROUP_IDS.has(outerGroup.id) && (() => {
                const c = getColor(outerVal);
                return c ? <span className="h-3.5 w-3.5 rounded-full border border-line" style={c.multi ? { background: 'conic-gradient(from 0deg, #e0507a, #f4d03f, #2b6cb0, #1c8a5b, #e0507a)' } : { backgroundColor: c.hex }} /> : null;
              })()}
              {outerVal}
            </p>
            <div className="space-y-2 ml-5">
              {innerValues.map((innerVal) => {
                // Find the combo that matches these parts
                const combo = combinations.find((c) => c.parts.includes(outerVal) && c.parts.includes(innerVal));
                if (!combo) return null;
                return (
                  <div key={combo.key} className="flex items-center gap-3">
                    <span className="w-12 text-sm text-ink/70 flex-shrink-0">{innerVal}</span>
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
        ))}
      </div>
    );
  };

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
            {categories.map((c) => {
              const isSelected = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryChange(c.id)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-burgundy text-white border border-burgundy'
                      : 'bg-white border border-line text-ink/70 hover:border-ink/25 hover:text-ink'
                  }`}
                >
                  {c.label}
                  {isSelected && <Check size={13} className="inline ml-1.5 -mt-0.5" />}
                </button>
              );
            })}
          </div>
          {errors.category && <p className="mt-1 text-xs text-burgundy">{errors.category}</p>}
        </div>
        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Sous-catégorie</label>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.subcategories.map((s) => {
                const isSelected = subId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSubCategoryChange(s.id)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-burgundy text-white border border-burgundy'
                        : 'bg-white border border-line text-ink/70 hover:border-ink/25 hover:text-ink'
                    }`}
                  >
                    {s.label}
                    {isSelected && <Check size={13} className="inline ml-1.5 -mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Nom + 4. Description */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Informations du produit</h2>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom du produit</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p className="mt-1 text-xs text-burgundy">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
          <textarea className="input-field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          {errors.description && <p className="mt-1 text-xs text-burgundy">{errors.description}</p>}
        </div>
      </div>

      {/* 5. Photos */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Photos du produit</h2>
          <p className="mt-1 text-xs text-ink/45">Ajoutez des photos claires de votre produit. Vous pouvez sélectionner plusieurs photos.</p>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {images.map((img, i) => (
              <div key={i} className="relative group rounded-lg overflow-hidden bg-cream aspect-square">
                <img src={img} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-burgundy px-1.5 py-0.5 text-[9px] font-medium text-white flex items-center gap-0.5">
                    <Star size={8} fill="white" /> Principale
                  </span>
                )}
                <div className="absolute top-1 right-1 flex gap-1">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => setPrimaryImage(i)}
                      className="rounded-full bg-white/90 p-1 text-ink/50 hover:text-burgundy transition-colors"
                      title="Définir comme photo principale"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="rounded-full bg-white/90 p-1 text-ink/50 hover:text-burgundy transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
            <p className="mt-1 text-xs text-ink/45">Sélectionnez les options disponibles pour ce produit. Ezial génère automatiquement les combinaisons de stock.</p>
          </div>

          {optionGroups.map((group) => {
            const isColor = COLOR_GROUP_IDS.has(group.id);
            const isSingle = SINGLE_CHOICE_IDS.has(group.id);
            const choiceLabel = isSingle ? 'Choix unique' : 'Choix multiple';

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
              </div>
            );
          })}
        </div>
      )}

      {/* 8. Stock */}
      {combinations.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">En stock</h2>
            <span className="text-xs text-ink/50">Total : <span className="font-semibold text-ink">{totalStock}</span></span>
          </div>

          {/* Legend if price by option is on */}
          {priceByOption && (
            <div className="flex items-center gap-4 text-[11px] text-ink/40 border-b border-line pb-2">
              <span className="w-24">Prix (FCFA)</span>
              <span>Stock</span>
            </div>
          )}

          {renderStockMatrix()}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => handleSubmit('draft')} className="btn-outline flex-1">Enregistrer en brouillon</button>
        <button onClick={() => handleSubmit('pending')} className="btn-primary flex-1">Soumettre pour validation</button>
      </div>
    </div>
  );
}
