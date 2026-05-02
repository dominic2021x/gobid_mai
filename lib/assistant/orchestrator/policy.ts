/**
 * Assistant policy: allowlist tools, per-subcategory field whitelist,
 * publish confirmation gate, and quotas.
 * "Friendly but limited" – only these actions may perform DB writes.
 */

/** Allowed tool/action names. Everything else gets deep-links + instructions only. */
export const ALLOWED_TOOLS = [
  "create_draft",
  "update_field",
  "validate_draft",
  "publish_draft",
  "create_support_ticket",
  "none",
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

/** Base draft fields (all categories). Unknown fields are rejected. */
export const BASE_DRAFT_FIELDS = [
  "title",
  "description",
  "category",
  "subcategory",
  "starting_price",
  "starting_price_ron",
  "starting_price_eur",
  "currency",
  "images",
] as const;

/** Extra fields per category/subcategory (optional). Key = category or "category/subcategory". */
export const FIELDS_BY_SUBCATEGORY: Record<string, readonly string[]> = {
  default: [...BASE_DRAFT_FIELDS],
  "Imobiliare": [...BASE_DRAFT_FIELDS, "category_level_3", "size", "county", "city", "address"],
  "Autovehicule": [...BASE_DRAFT_FIELDS, "brand", "condition", "county", "city"],
  "Utilaje & Echipamente": [...BASE_DRAFT_FIELDS, "condition", "county", "city"],
  "Artă & Antichități": [...BASE_DRAFT_FIELDS, "condition", "county", "city"],
};

/** Mandatory fields for publish (same for all). */
export const MANDATORY_FIELDS_FOR_PUBLISH = [
  "title",
  "description",
  "category",
  "subcategory",
  "starting_price",
  "currency",
] as const;

/** Publish requires explicit user confirmation stored in assistant_state.data.publish_confirmed_at. */
export const PUBLISH_CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 min

/** Max publish actions per user per day. */
export const DAILY_PUBLISH_LIMIT = 10;

/** Max support tickets created via assistant per user per day. */
export const DAILY_SUPPORT_TICKET_LIMIT = 3;

export function isAllowedTool(action: string): action is AllowedToolName {
  return (ALLOWED_TOOLS as readonly string[]).includes(action.toLowerCase().trim());
}

export function isAllowedDraftField(field: string, category?: string | null): boolean {
  const key = category?.trim() || "default";
  const list = FIELDS_BY_SUBCATEGORY[key] ?? FIELDS_BY_SUBCATEGORY.default;
  return (list as readonly string[]).includes(field);
}

export function getAllowedFieldsForCategory(category?: string | null): readonly string[] {
  const key = category?.trim() || "default";
  return FIELDS_BY_SUBCATEGORY[key] ?? FIELDS_BY_SUBCATEGORY.default;
}
