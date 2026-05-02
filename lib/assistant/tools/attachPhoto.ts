import type { AssistantContext } from "./types";

/** Allowed hostnames for image URLs (Cloudinary and optional app storage). */
const ALLOWED_IMAGE_ORIGINS = [
  "res.cloudinary.com",
  "res-cdn.cloudinary.com",
] as const;

function isAllowedImageOrigin(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return ALLOWED_IMAGE_ORIGINS.some((origin) => host === origin || host.endsWith("." + origin));
  } catch {
    return false;
  }
}

/**
 * Appends a photo URL to the product's images array. Ownership enforced by RLS.
 * Only URLs from allowed origins (Cloudinary) are accepted.
 */
export async function attachPhoto(
  ctx: AssistantContext,
  productId: string,
  imageUrl: string
): Promise<{ ok: boolean }> {
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("attachPhoto: imageUrl is required");
  }
  const url = imageUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("attachPhoto: imageUrl must be http(s)");
  }
  if (!isAllowedImageOrigin(url)) {
    throw new Error("attachPhoto: doar URL-uri de la surse permise (ex. Cloudinary) sunt acceptate");
  }

  const { data: row, error: fetchError } = await ctx.supabase
    .from("products")
    .select("images")
    .eq("id", productId)
    .eq("user_id", ctx.userId)
    .single();

  if (fetchError || !row) {
    throw new Error("attachPhoto: product not found or not owned by user");
  }

  const images: string[] = Array.isArray(row.images) ? [...row.images] : [];
  if (images.length >= 20) {
    throw new Error("attachPhoto: maximum 20 images allowed");
  }
  images.push(url);

  const { error: updateError } = await ctx.supabase
    .from("products")
    .update({ images })
    .eq("id", productId)
    .eq("user_id", ctx.userId);

  if (updateError) {
    throw new Error(`attachPhoto: ${updateError.message}`);
  }
  return { ok: true };
}
