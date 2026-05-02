/**
 * Returns detail schema for (channel, category, subcategory).
 * Null = do not render "Mai multe detalii" / "Informații despre licitație" section.
 * Caching: pure function; callers may wrap with cache() for server.
 */

import type { DetailChannel, DetailSchema } from "./types";
import {
  getExecutariDetailFieldsForSubcategory,
  isKnownExecutariSubcategory,
  normalizeSubcategorySlug,
} from "./fieldRegistry";

export type GetDetailSchemaParams = {
  channel: DetailChannel;
  category: string;
  subcategory: string;
};

/** Common field keys always shown first when schema exists (order matters). */
const COMMON_FIELD_KEYS = [
  "cod_anunt",
  "pret",
  "categorie",
  "tip_vanzare",
  "judet",
  "oras",
  "data_licitatiei",
  "ora_licitatiei",
] as const;

/**
 * Returns schema for the given (channel, category, subcategory), or null if no detail section.
 * - Unknown subcategory -> null.
 * - Executări with no subcategory-specific fields and no common data -> still return schema so common row can show (Cod anunț, Preț, etc.).
 */
export function getDetailSchema(params: GetDetailSchemaParams): DetailSchema | null {
  const { channel, category, subcategory } = params;
  const catNorm = category?.trim().toLowerCase() ?? "";
  const subNorm = normalizeSubcategorySlug(subcategory ?? "");

  if (channel === "executari_insolventa" && catNorm === "executari") {
    if (!isKnownExecutariSubcategory(subNorm)) return null;
    const fields = getExecutariDetailFieldsForSubcategory(subNorm);
    return {
      fields,
      commonFieldKeys: [...COMMON_FIELD_KEYS],
    };
  }

  return null;
}
