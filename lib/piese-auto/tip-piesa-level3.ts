/**
 * Tip piesă – aceleași opțiuni ca la anunț manual (PIESE_AUTO_TIP_PIESA_OPTIONS).
 * Slug-uri pentru URL (?level3=…); în DB `category_level_3` = eticheta din formular.
 */

import { PIESE_AUTO_TIP_PIESA_OPTIONS } from "@/lib/piese-auto/infer-from-title";

/** Aliniat la listingsRepo.normalizeSubcategoryToKey și filtrul client /ro. */
export function tipPiesaLabelToSlug(label: string): string {
  if (!label) return "";
  return label
    .toLowerCase()
    .trim()
    .replace(/[ăâîșț]/g, (c) => ({ "ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t" }[c] || c))
    .replace(/\s+/g, "-");
}

export const PIESE_AUTO_LEVEL3_SLUGS: readonly string[] = PIESE_AUTO_TIP_PIESA_OPTIONS.map((o) =>
  tipPiesaLabelToSlug(o)
);

const _seen = new Set<string>();
for (const s of PIESE_AUTO_LEVEL3_SLUGS) {
  if (_seen.has(s)) {
    throw new Error(`[tip-piesa-level3] slug duplicat: ${s}`);
  }
  _seen.add(s);
}

/** slug din URL → etichetă exactă din dropdown (pentru afișare filtre /ro). */
export const PIESE_AUTO_LEVEL3_LABELS: Record<string, string> = Object.fromEntries(
  PIESE_AUTO_TIP_PIESA_OPTIONS.map((opt) => [tipPiesaLabelToSlug(opt), opt])
);

/**
 * Taxonomie veche (7 bucket-uri) → slug din lista actuală (URL-uri vechi / date migrate).
 */
const LEGACY_SLUG_TO_CURRENT_SLUG: Record<string, string> = {
  electronice: tipPiesaLabelToSlug("Electrică auto"),
  altele: tipPiesaLabelToSlug("Diverse"),
  interior: tipPiesaLabelToSlug("Interior auto"),
};

/** Valori extra posibile în `category_level_3` (bucket vechi sau scurt). */
const EXTRA_DB_VALUES_FOR_CURRENT_SLUG: Record<string, string[]> = {
  [tipPiesaLabelToSlug("Electrică auto")]: ["electronice"],
  [tipPiesaLabelToSlug("Diverse")]: ["altele"],
  [tipPiesaLabelToSlug("Interior auto")]: ["interior"],
};

/**
 * Valori de egalat în DB pentru filtrul Tip piesă (Prisma / Supabase).
 * `filterSlugLower` vine din URL (deja lowercase).
 */
export function getPieseAutoCategoryLevel3MatchVariants(filterSlugLower: string): string[] {
  let slug = filterSlugLower.trim().toLowerCase();
  if (LEGACY_SLUG_TO_CURRENT_SLUG[slug]) {
    slug = LEGACY_SLUG_TO_CURRENT_SLUG[slug]!;
  }
  const canonical = PIESE_AUTO_LEVEL3_LABELS[slug];
  const out = new Set<string>();
  if (canonical) out.add(canonical);
  const extras = EXTRA_DB_VALUES_FOR_CURRENT_SLUG[slug];
  if (extras) extras.forEach((e) => out.add(e));
  if (out.size === 0) {
    out.add(slug);
  }
  return [...out];
}

export function pieseAutoCategoryLevel3RowMatchesFilter(filterSlugLower: string, dbRaw: string): boolean {
  const variants = getPieseAutoCategoryLevel3MatchVariants(filterSlugLower);
  const db = String(dbRaw ?? "").trim();
  if (!db) return false;
  const dbL = db.toLowerCase();
  return variants.some((v) => v.toLowerCase() === dbL);
}

/** Cel puțin un slug selectat trebuie să potrivească valoarea din DB. */
export function pieseAutoCategoryLevel3RowMatchesAnySlug(
  filterSlugsLower: string[],
  dbRaw: string
): boolean {
  if (filterSlugsLower.length === 0) return true;
  return filterSlugsLower.some((slug) => pieseAutoCategoryLevel3RowMatchesFilter(slug, dbRaw));
}
