/**
 * Sursă unică pentru maparea subcategoriilor "Executări și Insolvență" la cele 8 canonice
 * folosite în RO_CATEGORIES.executari.subcategories.
 *
 * Context: în DB avem listări vechi/migrate cu valori brute pe coloana `subcategory`
 * (ex.: "lichidari-firme", "camioane", "utilaje-constructii", "bunuri-confiscate",
 * "mobilier-interior") care nu apar în sidebar fiindcă nu se află în lista canonică.
 *
 * Acest fișier:
 *   - definește lista canonică afișată pe /ro;
 *   - mapează valorile brute la cele canonice (folosit la count);
 *   - oferă aliasurile inverse (folosit la filtrul listărilor) astfel încât numărul
 *     din sidebar și numărul de listări vizibile să coincidă.
 *
 * Folosim DOAR coloana `subcategory` (indexată) – nu `custom_fields.listing_category`,
 * fiindcă query-ul de listings nu poate filtra eficient după el.
 */

import { RO_CATEGORIES } from "@/lib/data/ro-categories";

/** Cele 8 subcategorii canonice afișate în sidebar pentru categoria "Executări și Insolvență". */
export const CANONICAL_EXECUTARI_SUBCATEGORIES = [
  "oferte-grupate",
  "utilaje-echipamente",
  "exec-imobiliare",
  "exec-autovehicule",
  "exec-industrial",
  "exec-afaceri",
  "exec-office",
  "exec-altele",
] as const;

export type CanonicalExecutariSubcategory = (typeof CANONICAL_EXECUTARI_SUBCATEGORIES)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_EXECUTARI_SUBCATEGORIES);

/**
 * Mapare valori brute (rămase în DB) către subcategoria canonică afișată.
 *  - lichidari-firme   → exec-afaceri  (ofertă/lichidare a unei firme = afaceri)
 *  - utilaje-constructii → utilaje-echipamente
 *  - bunuri-confiscate → exec-altele
 *  - camioane           → exec-autovehicule
 *  - mobilier-interior  → exec-altele
 *
 * NOTĂ: lista include doar valori observate efectiv în baza de date pentru listări
 * cu `category='executari'` și status activ; orice altă valoare neacoperită cade
 * pe `exec-altele` ca fallback.
 */
const STRAY_TO_CANONICAL: Record<string, CanonicalExecutariSubcategory> = {
  "lichidari-firme": "exec-afaceri",
  "utilaje-constructii": "utilaje-echipamente",
  "bunuri-confiscate": "exec-altele",
  camioane: "exec-autovehicule",
  "mobilier-interior": "exec-altele",
};

/**
 * Returnează subcategoria canonică pentru o listare executari.
 *  - dacă valoarea e deja canonică → o întoarce ca atare;
 *  - dacă e cunoscută în mapa de strays → întoarce mapping-ul;
 *  - altfel → `exec-altele` (rămâne vizibilă în sidebar la „Altele”).
 */
export function canonicalizeExecutariSubcategory(rawSubcategory: string | null | undefined): CanonicalExecutariSubcategory {
  const sub = (rawSubcategory ?? "").trim().toLowerCase();
  if (sub && CANONICAL_SET.has(sub)) return sub as CanonicalExecutariSubcategory;
  if (sub && STRAY_TO_CANONICAL[sub]) return STRAY_TO_CANONICAL[sub];
  return "exec-altele";
}

/**
 * Aliasurile (valorile brute) care contează spre o subcategorie canonică.
 * Folosit la filtrarea listărilor: dacă userul alege "exec-afaceri" în sidebar,
 * trebuie să vadă atât listările cu `subcategory='exec-afaceri'`, cât și cele cu
 * `subcategory='lichidari-firme'`, fiindcă numărul afișat le-a inclus pe amândouă.
 *
 * Pentru `exec-altele` includem și fallback-ul: orice listare executari cu o
 * subcategorie necunoscută trebuie să apară aici. Filtrul SQL nu poate exprima
 * un „NOT IN canonical_set”, așa că includem doar strays-urile cunoscute.
 */
export function getExecutariSubcategoryAliases(canonical: string): string[] {
  const target = (canonical ?? "").trim().toLowerCase();
  if (!target) return [];
  const aliases = new Set<string>();
  if (CANONICAL_SET.has(target)) aliases.add(target);
  for (const [stray, mapped] of Object.entries(STRAY_TO_CANONICAL)) {
    if (mapped === target) aliases.add(stray);
  }
  return Array.from(aliases);
}

/** True dacă valoarea este în lista canonică afișată în sidebar pentru `executari`. */
export function isCanonicalExecutariSubcategory(value: string | null | undefined): value is CanonicalExecutariSubcategory {
  if (!value) return false;
  return CANONICAL_SET.has(value.trim().toLowerCase());
}

/** Listă canonică cu păstrarea ordinii din `RO_CATEGORIES.executari.subcategories`. */
export function getCanonicalExecutariSubcategoriesInOrder(): readonly string[] {
  const fromTaxonomy = RO_CATEGORIES.executari?.subcategories ?? [];
  if (fromTaxonomy.length === CANONICAL_EXECUTARI_SUBCATEGORIES.length) return fromTaxonomy;
  return CANONICAL_EXECUTARI_SUBCATEGORIES;
}
