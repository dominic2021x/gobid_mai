/**
 * Builds display rows from schema + listing. Only includes rows with non-empty values.
 * Used by licitatii-publice product page. Safe for SSR; no DB.
 */

import type { DetailSchema, DetailRow, ListingDetailSource } from "./types";

const EMPTY_PLACEHOLDER = "—";

function getCfValue(cf: Record<string, unknown> | null, keys: string[]): unknown {
  if (!cf || typeof cf !== "object") return undefined;
  for (const k of keys) {
    const v = cf[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

/** Consider empty: null, undefined, "" (trimmed). Numeric 0 and "0" are valid. */
function isEmpty(value: unknown, format?: string): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  if (s === "") return true;
  if (format === "number" && (s === "0" || value === 0)) return false;
  return false;
}

function formatDisplayValue(value: unknown, format?: string): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  const s = String(value).trim();
  if (s === "") return EMPTY_PLACEHOLDER;
  if (format === "number" && (value === 0 || s === "0")) return s;
  return s;
}

export type GetDetailRowsParams = {
  schema: DetailSchema;
  listing: ListingDetailSource;
  /** Format date for display (e.g. "Data licitației"). */
  formatDateDisplay: (date: string | null | undefined) => string;
  /** Whether auction date is in the past (then data_licitatiei can show "—"). */
  isAuctionInPast: boolean;
  /** Precomputed price string (e.g. "Preț la cerere" or "120.000 Lei"). */
  priceDisplay: string;
};

/**
 * Returns ordered detail rows. Only rows with non-empty values are included.
 * Common rows (cod_anunt, pret, categorie, etc.) are added first when schema.commonFieldKeys is set.
 */
export function getDetailRows(params: GetDetailRowsParams): DetailRow[] {
  const { schema, listing, formatDateDisplay, isAuctionInPast, priceDisplay } = params;
  const cf = (listing.customFields ?? {}) as Record<string, unknown>;
  const rows: DetailRow[] = [];

  if (schema.commonFieldKeys?.length) {
    const codAnunt = formatDisplayValue(getCfValue(cf, ["cod_anunt", "Cod anunț"]));
    const categorie = formatDisplayValue(listing.category);
    const tipVanzare = formatDisplayValue(getCfValue(cf, ["sale_type"])) !== EMPTY_PLACEHOLDER
      ? formatDisplayValue(getCfValue(cf, ["sale_type"]))
      : "Licitatie publica";
    const judet = formatDisplayValue(listing.county);
    const oras = formatDisplayValue(listing.city);
    const dataLicitatiei = isAuctionInPast ? EMPTY_PLACEHOLDER : formatDateDisplay(listing.auctionDate ?? undefined);
    const oraLicitatiei = isAuctionInPast ? EMPTY_PLACEHOLDER : formatDisplayValue(getCfValue(cf, ["auction_time", "ora_licitatiei", "Ora_licitație"]));

    const common: { key: string; label: string; value: string }[] = [
      { key: "cod_anunt", label: "Cod anunț", value: codAnunt },
      { key: "pret", label: "Preț", value: priceDisplay },
      { key: "categorie", label: "Categorie", value: categorie },
      { key: "tip_vanzare", label: "Tip vânzare", value: tipVanzare },
      { key: "judet", label: "Județ", value: judet },
      { key: "oras", label: "Oraș", value: oras },
      { key: "data_licitatiei", label: "Data licitației", value: dataLicitatiei },
      { key: "ora_licitatiei", label: "Ora licitației", value: oraLicitatiei },
    ];

    for (const r of common) {
      if (r.value !== EMPTY_PLACEHOLDER || r.key === "cod_anunt" || r.key === "pret" || r.key === "categorie" || r.key === "tip_vanzare" || (["data_licitatiei", "ora_licitatiei"].includes(r.key) && !isAuctionInPast)) {
        rows.push({ key: r.key, label: r.label, value: r.value });
      }
    }
  }

  for (const field of schema.fields) {
    const value = getCfValue(cf, field.cfKeys);
    if (isEmpty(value, field.format)) continue;
    rows.push({
      key: field.key,
      label: field.label,
      value: formatDisplayValue(value, field.format),
    });
  }

  return rows;
}

/**
 * Guard: only render the detail section if at least one row has a displayable value.
 * Used to hide the entire block when schema returns no rows (e.g. unknown subcategory or all empty).
 */
export function hasDisplayableDetailRows(rows: DetailRow[]): boolean {
  const EMPTY = "—";
  return rows.some((r) => r.value !== EMPTY && r.value.trim() !== "");
}
