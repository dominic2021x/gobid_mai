/**
 * Types for schema-driven listing detail fields (Executări și Insolvență channel).
 * Single source of truth for (channel, category, subcategory) -> which fields to display.
 */

/** Display format hint for value rendering (dates, numbers, currency). */
export type DetailFieldFormat = "text" | "number" | "currency" | "date" | "datetime";

/** One detail field: label + where to read value from custom_fields (fallback keys). */
export type DetailFieldDef = {
  /** Stable key for React and schema identity. */
  key: string;
  /** Display label (e.g. "Suprafață", "Data licitației"). */
  label: string;
  /** custom_fields keys in order of precedence (first non-empty wins). */
  cfKeys: string[];
  format?: DetailFieldFormat;
};

/** Group of fields (optional; for future grouping in UI). */
export type DetailGroup = {
  title?: string;
  fields: DetailFieldDef[];
};

/** Schema for a (channel, category, subcategory): ordered fields to show. */
export type DetailSchema = {
  /** Fields specific to this subcategory (excluding common row). */
  fields: DetailFieldDef[];
  /** Optional common field keys always prepended (e.g. cod_anunt, pret, data_licitatiei). */
  commonFieldKeys?: string[];
};

/** Channel identifier for detail schema lookup. */
export type DetailChannel = "ro" | "executari_insolventa";

/** Normalized listing source: custom_fields + top-level auction fields used by getDetailRows. */
export type ListingDetailSource = {
  customFields: Record<string, unknown> | null;
  category?: string | null;
  subcategory?: string | null;
  county?: string | null;
  city?: string | null;
  auctionDate?: string | null;
  /** Precomputed display price (optional). */
  priceDisplay?: string | null;
  currency?: string | null;
  startingBidRON?: number | null;
};

/** One row to render in the "Informații despre licitație" grid. */
export type DetailRow = {
  label: string;
  value: string;
  key: string;
};
