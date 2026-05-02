/**
 * Normalize search query for deduplication and matching.
 * q_norm: lowercase, trim, collapse whitespace, strip diacritics.
 */

export function normalizeQuery(q: string): string {
  if (q == null || typeof q !== "string") return "";
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim() || "";
}
