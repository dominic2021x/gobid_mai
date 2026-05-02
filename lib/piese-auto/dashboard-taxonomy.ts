/**
 * Dashboard „Piese auto”: formularul folosește etichete afișate; în DB trebuie slug-uri canonice
 * (același contract ca importul CSV din import-products-core).
 */

import { SUBCATEGORY_DISPLAY_TO_KEY } from "@/lib/categories";
import { PIESE_AUTO_CATEGORY_SLUG, PIESE_AUTO_SUBCATEGORY_SLUG } from "@/lib/piese-auto/taxonomy-slugs";

export const PIESE_AUTO_FORM_CATEGORY_DISPLAY = "Autovehicule";
export const PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY = "Piese Auto și Accesorii";

/** Din rând DB → valori pentru câmpurile din formular (dropdown-uri). */
export function pieseAutoCategoryFromDbToFormDisplay(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return PIESE_AUTO_FORM_CATEGORY_DISPLAY;
  if (t === PIESE_AUTO_CATEGORY_SLUG) return PIESE_AUTO_FORM_CATEGORY_DISPLAY;
  if (t === PIESE_AUTO_FORM_CATEGORY_DISPLAY.toLowerCase()) return PIESE_AUTO_FORM_CATEGORY_DISPLAY;
  return PIESE_AUTO_FORM_CATEGORY_DISPLAY;
}

export function pieseAutoSubcategoryFromDbToFormDisplay(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  const lower = t.toLowerCase();
  if (!t) return PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY;
  if (lower === PIESE_AUTO_SUBCATEGORY_SLUG) return PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY;
  const fromSlug = Object.entries(SUBCATEGORY_DISPLAY_TO_KEY).find(([, slug]) => slug === lower)?.[0];
  if (fromSlug) return fromSlug;
  return PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY;
}
