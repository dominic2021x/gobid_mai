/**
 * Canonical filter types for /ro and /admin/recategorizare.
 * Single source of truth for filter keys, groups, and state.
 */

/** URL/query keys used by both /ro and admin. Validate against this. */
export const FILTER_QUERY_KEYS = [
  "q",
  "category",
  "categorie",
  "subcategory",
  "subcategorie",
  "level3",
  "category_level_3",
  "execCat",
  "execCats",
  "county",
  "city",
  "location",
  "priceMin",
  "priceMax",
  "price_min",
  "price_max",
  "size",
  "sizes",
  "brand",
  "brands",
  "color",
  "colors",
  "condition",
  "conditions",
  "model",
  "status",
  "sort",
  "titleSearch",
  "titleSearchMode",
  "page",
  "pageSize",
  "cursor",
  "from",
  "limit",
] as const;

export type FilterQueryKey = (typeof FILTER_QUERY_KEYS)[number];

export type FilterGroupId =
  | "category"
  | "subcategory"
  | "execMaiMulteDetalii"
  | "tipTeren"
  | "county"
  | "city"
  | "price"
  | "brand"
  | "size"
  | "color"
  | "condition"
  | "attributes";

export interface FilterGroup {
  id: FilterGroupId;
  label: string;
  order: number;
  type: "select" | "multiselect" | "checkbox" | "radio" | "text" | "number";
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

/** Schema returned by getRoFilterSchema() – used by both /ro and admin. */
export interface RoFilterSchema {
  categories: { slug: string; name: string; subcategories: string[] }[];
  subcategoryNames: Record<string, string>;
  level3BySubcategory: Record<string, string[]>;
  /** Etichete pentru level3 când slug-ul nu e în `subcategoryNames` (ex. piese-auto: motor → Motor). */
  level3LabelsBySubcategory?: Record<string, Record<string, string>>;
  /** Level4: doar terenuri, exec-imobiliare – intravilan / extravilan */
  level4BySubcategory: Record<string, string[]>;
  level4Labels: Record<string, string>;
  attributeOptions: Record<string, string[]>;
  fieldsBySubcategory: Record<string, { productFields: string[]; attributeKeys: string[] }>;
}
