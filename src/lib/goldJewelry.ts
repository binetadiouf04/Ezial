// Bijoux en or véritable — non autorisés sur Ezial (fluctuation du prix de l'or,
// contraintes de vente). Code pur (aucun accès réseau), testé par
// src/lib/goldJewelry.test.mjs.
//
// La règle est volontairement ciblée : elle ne bloque PAS les mots « or » ou
// « doré » en général, car les bijoux plaqués or, dorés, fantaisie ou en acier
// inoxydable sont autorisés. Elle repère :
//   - la matière « Or » choisie dans la fiche produit (or, or massif, or rose…) ;
//   - les mentions explicites d'or véritable dans le nom ou la description :
//     « or massif », « or véritable », « or 18K », « or 21 carats », « 18 carats
//     d'or », « 750 », « solid gold », « 18K gold »…
// après avoir écarté ce qui est expressément autorisé : « plaqué or (18K) »,
// « doré à l'or fin », « gold plated », « couleur or », « effet or »…
//
// Le même raisonnement est appliqué côté serveur par la fonction SQL
// ezial_private.mentions_real_gold() et le déclencheur de la table products
// (docs/sql/bijoux-or-interdit.sql), pour que la règle ne puisse pas être
// contournée depuis l'API.

export const GOLD_JEWELRY_MESSAGE = 'La vente de bijoux en or véritable n’est pas autorisée sur Ezial.';
export const GOLD_JEWELRY_HINT = 'Les bijoux plaqués or, fantaisie, en acier inoxydable et les autres accessoires restent acceptés.';

/** Catégorie concernée (Bijoux & Accessoires). La règle ne s'applique pas aux autres : « gold 24K » est courant en cosmétique. */
export const GOLD_JEWELRY_CATEGORY = 'bijoux';

/** Minuscules, sans accents, apostrophes droites : « Plaqué OR » → « plaque or ». */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const KARAT = '(?:8|9|10|14|18|21|22|24)\\s*(?:k|kt|ct|carats?|karats?)';

// Formulations autorisées : retirées du texte avant la recherche d'or véritable.
const ALLOWED: RegExp[] = [
  new RegExp(`\\bplaque(?:e|es|s)?\\s+(?:en\\s+|d'\\s*)?or\\b(?:\\s+(?:jaune|blanc|rose|fin))?(?:\\s*${KARAT}\\b)?`, 'g'),
  new RegExp(`\\bdore(?:e|es|s)?\\s+a\\s+l'\\s*or\\b(?:\\s+fin)?(?:\\s*${KARAT}\\b)?`, 'g'),
  /\bgold[\s-]*(?:plated|filled|tone)\b/g,
  /\b(?:couleur|effet|ton|teinte|finition|aspect|imitation|style|facon|nuance|type)\s+(?:d'\s*)?or\b/g,
];

// Mentions d'or véritable.
const REAL_GOLD: RegExp[] = [
  /\bor\s+(?:massif|veritable|pur|fin|natif)\b/,
  /\bvraie?\s+or\b/,
  new RegExp(`\\bor\\s+(?:(?:jaune|blanc|gris|rose)\\s+)?(?:de\\s+)?${KARAT}\\b`),
  new RegExp(`\\b${KARAT}\\s+(?:d'\\s*)?(?:or|gold)\\b`),
  new RegExp(`\\bgold\\s+${KARAT}\\b`),
  /\b(?:solid|real|pure)\s+gold\b/,
  /\bor\s+(?:375|585|750|916|999)\b/,
];

// Valeur de la matière : « Or », « Or massif », « Or rose »… (jamais « Plaqué or »).
const GOLD_MATERIAL_VALUE = /^or(?:\s+(?:jaune|blanc|gris|rose|massif|fin|pur))?$/;

/** Vrai si le texte annonce de l'or véritable (et pas du plaqué, du doré ou de la couleur or). */
export function mentionsRealGold(text: string | null | undefined): boolean {
  if (!text) return false;
  let t = foldText(text);
  for (const re of ALLOWED) t = t.replace(re, ' ');
  return REAL_GOLD.some((re) => re.test(t));
}

/** Vrai si la valeur d'une caractéristique « Matière » est de l'or véritable. */
export function isGoldMaterialValue(value: string): boolean {
  const v = foldText(value);
  return GOLD_MATERIAL_VALUE.test(v) || mentionsRealGold(v);
}

function isMaterialKey(key: string): boolean {
  const k = foldText(key);
  return k === 'matiere' || k === 'matieres' || k === 'material';
}

export interface GoldCheckInput {
  category?: string | null;
  name?: string | null;
  description?: string | null;
  descriptiveAttributes?: Record<string, string[] | string> | null;
}

/** Vrai si le produit est un bijou en or véritable : à refuser à la publication. */
export function isRealGoldJewelry(input: GoldCheckInput): boolean {
  if (input.category !== GOLD_JEWELRY_CATEGORY) return false;
  if (mentionsRealGold(input.name) || mentionsRealGold(input.description)) return true;
  for (const [key, raw] of Object.entries(input.descriptiveAttributes ?? {})) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (typeof value !== 'string') continue;
      if (isMaterialKey(key) ? isGoldMaterialValue(value) : mentionsRealGold(value)) return true;
    }
  }
  return false;
}
