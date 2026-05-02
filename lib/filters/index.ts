/**
 * Canonical filter module for /ro and /admin/recategorizare.
 * Single source of truth: types, schema builder, and re-exports.
 */

export type {
  FilterQueryKey,
  FilterGroupId,
  FilterGroup,
  FilterOption,
  RoFilterSchema,
} from "./filters.types";
export { FILTER_QUERY_KEYS } from "./filters.types";
export {
  getRoFilterSchema,
  EXEC_LIST_CATEGORY_OPTIONS,
  EXEC_MAI_MULTE_DETALII_OPTIONS,
  TIP_TEREN_VISIBLE_SLUGS,
  TIP_TEREN_LABELS,
} from "./getRoFilterSchema";
