import type { AssistantContext, DraftFieldName } from "./types";
import { DRAFT_FIELD_WHITELIST } from "./types";

const TITLE_MAX_LENGTH = 200;
const ALLOWED_CURRENCIES = new Set(["RON", "EUR"]);
const MAX_IMAGES = 20;

const ALLOWED_IMAGE_ORIGINS = ["res.cloudinary.com", "res-cdn.cloudinary.com"] as const;

function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      (url.startsWith("http://") || url.startsWith("https://")) &&
      ALLOWED_IMAGE_ORIGINS.some((origin) => host === origin || host.endsWith("." + origin))
    );
  } catch {
    return false;
  }
}

/**
 * Validates and applies a patch of draft fields in a single UPDATE.
 * - Keys must be in DRAFT_FIELD_WHITELIST (strict whitelist).
 * - title max 200; starting_price > 0; currency Lei/EUR (normalized); images array of allowed URLs.
 * - Single UPDATE; ownership enforced via .eq("user_id", ctx.userId) (defense-in-depth with RLS).
 */
export async function updateDraftFieldsBatch(
  ctx: AssistantContext,
  productId: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean }> {
  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (!DRAFT_FIELD_WHITELIST.includes(key as DraftFieldName)) {
      throw new Error(`updateDraftFieldsBatch: field "${key}" is not allowed`);
    }

    if (key === "title") {
      const s = typeof value === "string" ? value.trim() : String(value ?? "").trim();
      if (s.length > TITLE_MAX_LENGTH) {
        throw new Error(`updateDraftFieldsBatch: title length exceeds ${TITLE_MAX_LENGTH}`);
      }
      payload[key] = s;
      continue;
    }

    if (key === "starting_price") {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num) || num <= 0) {
        throw new Error("updateDraftFieldsBatch: starting_price must be a number > 0");
      }
      payload.starting_price = num;
      payload.starting_price_ron = num;
      payload.starting_price_eur = num;
      continue;
    }

    if (key === "currency") {
      const c = typeof value === "string" ? value.trim().toUpperCase() : String(value ?? "").trim().toUpperCase();
      if (!ALLOWED_CURRENCIES.has(c)) {
        throw new Error("updateDraftFieldsBatch: currency must be RON or EUR");
      }
      payload[key] = c;
      continue;
    }

    if (key === "starting_price_ron" || key === "starting_price_eur") {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num) || num <= 0) {
        throw new Error(`updateDraftFieldsBatch: ${key} must be a number > 0`);
      }
      payload[key] = num;
      continue;
    }

    if (key === "images") {
      if (!Array.isArray(value)) {
        throw new Error("updateDraftFieldsBatch: images must be an array");
      }
      if (value.length > MAX_IMAGES) {
        throw new Error(`updateDraftFieldsBatch: maximum ${MAX_IMAGES} images allowed`);
      }
      const urls: string[] = [];
      for (const item of value) {
        const url = typeof item === "string" ? item.trim() : "";
        if (!url || !isAllowedImageUrl(url)) {
          throw new Error("updateDraftFieldsBatch: images must be an array of allowed URLs (http(s), Cloudinary)");
        }
        urls.push(url);
      }
      payload[key] = urls;
      continue;
    }

    payload[key] = value;
  }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[updateDraftFieldsBatch] single UPDATE, keys:", Object.keys(payload).join(", "));
  }

  const { data, error } = await ctx.supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .select("id")
    .single();

  if (error) {
    throw new Error(`updateDraftFieldsBatch: ${error.message}`);
  }
  if (!data) {
    throw new Error("updateDraftFieldsBatch: product not found or not owned by user");
  }
  return { ok: true };
}
