/**
 * Tokenizare pentru search RO: split pe spațiu, filtrare tokeni goi, limită tokeni.
 */

import { normalizeRo } from "./roNormalize";

const MAX_TOKENS = 10;

/**
 * Tokenizează un string normalizat RO: split pe spațiu, fără tokeni goi, max 10 tokeni.
 */
export function tokenizeRo(norm: string): string[] {
  if (norm == null || typeof norm !== "string") return [];
  const trimmed = norm.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  return tokens.slice(0, MAX_TOKENS);
}

/**
 * Returnează tokenii pentru un input raw (îl normalizează mai întâi).
 */
export function tokenizeRoFromInput(input: string): string[] {
  const norm = normalizeRo(input);
  return tokenizeRo(norm);
}
