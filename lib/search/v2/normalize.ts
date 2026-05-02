/**
 * Normalize search query for v2 (length, trim, diacritics).
 */

export const MIN_Q_LENGTH = 2;
export const MAX_Q_LENGTH = 120;

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
    .trim()
    .slice(0, MAX_Q_LENGTH) || "";
}

export function validateQueryLength(qNorm: string): boolean {
  return qNorm.length >= MIN_Q_LENGTH && qNorm.length <= MAX_Q_LENGTH;
}
