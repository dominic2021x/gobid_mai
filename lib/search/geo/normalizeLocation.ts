/**
 * Normalize location strings for matching: diacritics, lowercase, trim, collapse spaces.
 */

import { DIACRITICS_MAP } from "./constants";

function replaceDiacritics(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(DIACRITICS_MAP)) {
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * Normalize for location matching: lowercase, trim, collapse spaces, strip diacritics.
 */
export function normalizeLocation(input: string): string {
  if (input == null || typeof input !== "string") return "";
  return replaceDiacritics(input)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Slug form for URLs/codes: same as normalize + replace spaces with hyphen, remove non-alphanumeric.
 */
export function locationToSlug(input: string): string {
  const norm = normalizeLocation(input);
  return norm.replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "loc";
}
