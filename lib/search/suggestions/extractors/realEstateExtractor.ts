/**
 * Real-estate suggestion extraction from listing titles.
 * Deterministic rules only; max 2–4 candidates per title.
 */

import { toNorm } from "../normalize";

export type Candidate = { entity_type: string; label: string };

const TEREN_TYPES = ["teren intravilan", "teren extravilan", "teren agricol"] as const;

/**
 * Extract real-estate suggestion candidates from a title.
 * Rules: teren, teren intravilan/extravilan/agricol, apartament, apartament N camere, casa, spatiu comercial.
 */
export function extractRealEstate(title: string): Candidate[] {
  if (!title || typeof title !== "string") return [];
  const norm = toNorm(title);
  const out: Candidate[] = [];
  const seen = new Set<string>();

  function add(entity_type: string, label: string) {
    const key = `${entity_type}:${toNorm(label)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ entity_type, label });
  }

  if (/\bteren\b/.test(norm)) {
    add("real_estate", "teren");
  }
  for (const tt of TEREN_TYPES) {
    if (norm.includes(toNorm(tt))) add("real_estate", tt);
  }
  if (/\bapartament\b/.test(norm)) {
    add("real_estate", "apartament");
    const camMatch = norm.match(/apartament\s*(?:cu\s*)?([1-9]|10)\s*cam/);
    if (camMatch) {
      const n = camMatch[1];
      add("real_estate", `apartament ${n} camere`);
    }
  }
  if (/\bcasa\b/.test(norm) || /\bcasă\b/.test(title)) {
    add("real_estate", "casa");
  }
  if (/\bspatiu\s+comercial\b/.test(norm) || /\bspațiu\s+comercial/.test(title)) {
    add("real_estate", "spatiu comercial");
  }

  return out.slice(0, 4);
}
