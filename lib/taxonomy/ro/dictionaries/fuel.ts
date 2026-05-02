/**
 * Fuel keywords -> canonical slug (benzina|diesel|electric|hybrid|gpl).
 * Normalize input: lowercase, no diacritics, before lookup.
 */
import type { AutoFuel } from "@/lib/taxonomy/ro/attributes";

/** Keys must be normalized (lowercase, no diacritics) to match normalizeForCategorization output. */
export const FUEL_SYNONYMS: Record<string, AutoFuel> = {
  benzina: "benzina",
  petrol: "benzina",
  gasoline: "benzina",
  diesel: "diesel",
  motorina: "diesel",
  electric: "electric",
  electrice: "electric",
  ev: "electric",
  hibrid: "hybrid",
  hybrid: "hybrid",
  hybrida: "hybrid",
  plug: "hybrid",
  gpl: "gpl",
  gaz: "gpl",
  lpg: "gpl",
};
