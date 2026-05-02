/**
 * Registry of detail fields per (channel, category, subcategory).
 * Executări și Insolvență: subcategory-personalized fields only. No generic list.
 * Imobiliare behavior is unchanged (handled by lib/imobiliare-fields.ts).
 */

import type { DetailFieldDef } from "./types";

/** Executări subcategory slugs (must match ro-categories). */
const EXEC_SUBCATS = [
  "oferte-grupate",
  "utilaje-echipamente",
  "exec-imobiliare",
  "exec-autovehicule",
  "exec-industrial",
  "exec-afaceri",
  "exec-office",
  "exec-altele",
] as const;

/** Imobiliare (exec-imobiliare): Tip imobil, teren, camere, etaj, suprafață. */
const EXEC_IMOBILIARE_FIELDS: DetailFieldDef[] = [
  { key: "tip_imobil", label: "Tip imobil", cfKeys: ["Tip imobil", "tip_imobil"] },
  { key: "categorie_teren", label: "Categorie teren", cfKeys: ["Categorie teren", "categorie_teren", "intravilan_extravilan"] },
  { key: "camere", label: "Camere", cfKeys: ["Camere", "camere", "numarCamere"] },
  { key: "etaj", label: "Etaj", cfKeys: ["Etaj", "etaj"] },
  { key: "suprafata", label: "Suprafață", cfKeys: ["Suprafață", "suprafata", "suprafata_utila"], format: "text" },
];

/** Utilaje & Echipamente: marca, model, an, stare, specificații (fără camere/suprafață imobiliară). */
const UTILAJE_ECHIPAMENTE_FIELDS: DetailFieldDef[] = [
  { key: "marca", label: "Marca", cfKeys: ["marca", "Marca", "info_marca"] },
  { key: "model", label: "Model", cfKeys: ["model", "Model", "info_model"] },
  { key: "an", label: "An fabricație", cfKeys: ["an", "An fabricație", "info_an_fabricatie"], format: "number" },
  { key: "stare", label: "Stare", cfKeys: ["stare", "Stare", "condition"] },
  { key: "capacitate_motor", label: "Capacitate motor", cfKeys: ["capacitate_motor", "capacitate_cilindrica", "Capacitate cilindrică", "info_capacitate_cilindrica"] },
  { key: "putere", label: "Putere", cfKeys: ["putere", "Putere"] },
];

/** Autovehicule (exec-autovehicule): marca, model, km, combustibil, an, capacitate. */
const EXEC_AUTOVEHICULE_FIELDS: DetailFieldDef[] = [
  { key: "marca", label: "Marca", cfKeys: ["marca", "Marca", "info_marca"] },
  { key: "model", label: "Model", cfKeys: ["model", "Model", "info_model"] },
  { key: "kilometraj", label: "Kilometraj", cfKeys: ["kilometraj", "Kilometraj", "km", "info_km"], format: "number" },
  { key: "combustibil", label: "Combustibil", cfKeys: ["combustibil", "Combustibil", "info_combustibil"] },
  { key: "an", label: "An fabricație", cfKeys: ["an", "An fabricație", "info_an_fabricatie"], format: "number" },
  { key: "capacitate_cilindrica", label: "Capacitate cilindrică", cfKeys: ["capacitate_cilindrica", "Capacitate cilindrică", "info_capacitate_cilindrica"] },
];

/** Industrial / Afaceri / Office / Altele / Oferte grupate: minimal or none. */
const EXEC_MINIMAL_FIELDS: DetailFieldDef[] = [
  { key: "tip_bun", label: "Tip bun", cfKeys: ["Tip_produs", "tip_produs", "tip_bun"] },
];

/** Map: Executări subcategory slug -> detail fields (only subcategory-specific; common fields added in getDetailSchema). */
export const EXECUTARI_DETAIL_FIELDS_BY_SUBCATEGORY: Record<string, DetailFieldDef[]> = {
  "exec-imobiliare": EXEC_IMOBILIARE_FIELDS,
  "utilaje-echipamente": UTILAJE_ECHIPAMENTE_FIELDS,
  "exec-autovehicule": EXEC_AUTOVEHICULE_FIELDS,
  "exec-industrial": EXEC_MINIMAL_FIELDS,
  "exec-afaceri": EXEC_MINIMAL_FIELDS,
  "exec-office": EXEC_MINIMAL_FIELDS,
  "exec-altele": EXEC_MINIMAL_FIELDS,
  "oferte-grupate": [], // no extra fields; only common row if present
};

export function isKnownExecutariSubcategory(subcategorySlug: string): boolean {
  const slug = normalizeSubcategorySlug(subcategorySlug);
  return (EXEC_SUBCATS as readonly string[]).includes(slug);
}

export function getExecutariDetailFieldsForSubcategory(subcategorySlug: string): DetailFieldDef[] {
  const slug = normalizeSubcategorySlug(subcategorySlug);
  if (!isKnownExecutariSubcategory(slug)) return [];
  return EXECUTARI_DETAIL_FIELDS_BY_SUBCATEGORY[slug] ?? [];
}

/** Normalize for lookup: lowercase, trim, Romanian diacritics -> ascii, " & " -> "-". */
export function normalizeSubcategorySlug(value: string): string {
  if (!value || typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
