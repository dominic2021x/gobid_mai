/**
 * Schema-driven listing details for Executări și Insolvență.
 * Single source of truth: (channel, category, subcategory) -> detail fields.
 */

export type {
  DetailChannel,
  DetailFieldDef,
  DetailGroup,
  DetailRow,
  DetailSchema,
  DetailFieldFormat,
  ListingDetailSource,
} from "./types";

export {
  getExecutariDetailFieldsForSubcategory,
  isKnownExecutariSubcategory,
  normalizeSubcategorySlug,
  EXECUTARI_DETAIL_FIELDS_BY_SUBCATEGORY,
} from "./fieldRegistry";

export { getDetailSchema } from "./getDetailSchema";
export type { GetDetailSchemaParams } from "./getDetailSchema";

export { getDetailRows, hasDisplayableDetailRows } from "./getDetailRows";
export type { GetDetailRowsParams } from "./getDetailRows";
