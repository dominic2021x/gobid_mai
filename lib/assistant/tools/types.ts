import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantContext = {
  supabase: SupabaseClient;
  userId: string;
};

/** Whitelist of product fields the assistant may update (no user_id, no channel/requires_token) */
export const DRAFT_FIELD_WHITELIST = [
  "title",
  "description",
  "category",
  "subcategory",
  "category_level_3",
  "size",
  "brand",
  "color",
  "condition",
  "county",
  "city",
  "address",
  "starting_price",
  "starting_price_ron",
  "starting_price_eur",
  "currency",
  "images",
  "custom_fields",
  "seo",
  "sku",
] as const;

export type DraftFieldName = (typeof DRAFT_FIELD_WHITELIST)[number];

export const MANDATORY_FIELDS_FOR_PUBLISH = [
  "title",
  "description",
  "category",
  "subcategory",
  "starting_price",
  "currency",
] as const;
