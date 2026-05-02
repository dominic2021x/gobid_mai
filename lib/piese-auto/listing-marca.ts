/**
 * Detectare anunțuri „piese auto” + extracție marcă pentru badge-uri pe imagini (carduri listă).
 */

export type ListingMarcaFields = {
  category?: string | null | undefined;
  subcategory?: string | null | undefined;
  brand?: string | null | undefined;
  custom_fields?: Record<string, unknown> | null | undefined;
  /** Unele carduri (favorite etc.) folosesc camelCase. */
  customFields?: Record<string, unknown> | null | undefined;
};

export function isPieseAutoListingProduct(
  p: Pick<ListingMarcaFields, "category" | "subcategory">,
): boolean {
  const cat = (p.category ?? "").trim().toLowerCase();
  const subRaw = (p.subcategory ?? "").trim().toLowerCase();
  const sub = subRaw.replace(/\s+/g, "-");
  return (
    cat === "autovehicule" &&
    (sub.includes("piese-auto") || sub.includes("piese_auto") || subRaw.includes("piese auto"))
  );
}

/** Marcă din coloană `brand` sau din `custom_fields` / `customFields` (marca / Marca / brand). */
export function getMarcaFromListing(p: ListingMarcaFields): string {
  const cf = (p.custom_fields ?? p.customFields ?? {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fromCf = pick(cf.marca) || pick(cf.Marca) || pick(cf.brand);
  const col = typeof p.brand === "string" ? p.brand.trim() : "";
  return (fromCf || col).trim();
}
