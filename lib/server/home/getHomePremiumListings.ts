/**
 * Server-only: fetch up to 4 premium listings for homepage.
 * Used by HomePremiumListingsServer. Cache with unstable_cache for public traffic.
 */

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getProductDisplayImage, type ProductLike } from "@/lib/getProductDisplayImage";
import { getFocalForImageUrl } from "@/lib/image/focal-from-product";
import { getCdnImageUrl, listingGridTransformOptions } from "@/lib/image/cdn";
import { enrichItemsWithImageFocal } from "@/lib/server/products/imageFocalEnrichment";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";

export interface HomePremiumItem {
  id: string;
  title: string;
  image: string;
  price: string;
  location: string;
  condition: string;
  /** Din DB (slug/text), pentru badge Nou/Uzat ca pe /ro — gol = fără rând badge. */
  conditionCode?: string | null;
  createdAt: string | null;
  url: string;
  slug: string;
  address: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  custom_fields?: Record<string, unknown> | null;
  /** Ca pe /ro: gratuit vs preț vs „Preț la cerere”. */
  isFreeListing?: boolean;
  startingPrice?: number;
  currency?: string;
}

function pickFirstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (typeof first === "string" && first.trim().length > 0) return first;
  if (first && typeof first === "object" && "url" in first && typeof (first as { url: string }).url === "string") {
    return (first as { url: string }).url;
  }
  return null;
}

async function fetchHomePremiumListingsUncached(): Promise<HomePremiumItem[]> {
  if (!supabaseAdmin) return [];
  const admin = supabaseAdmin;

  const now = new Date().toISOString();
  const { data: productsData, error } = await runPostgrestQuery<Record<string, unknown>[]>(
    (signal) =>
      admin
        .from("products")
        .select(
          "id, title, slug, images, starting_price, currency, city, county, address, auction_location, created_at, updated_at, custom_fields, product_type, category, subcategory, condition, brand"
        )
        .eq("status", "active")
        .eq("is_premium", true)
        .gte("premium_until", now)
        .order("created_at", { ascending: false })
        .limit(4)
        .abortSignal(signal),
    { timeoutMs: 5000, maxRetries: 0, retryDelayMs: 250 }
  );

  if (error || !productsData?.length) return [];

  const rows = productsData as Record<string, unknown>[];
  await enrichItemsWithImageFocal(rows);

  return rows.map((product) => {
    const cf = (product.custom_fields && typeof product.custom_fields === "object"
      ? product.custom_fields
      : {}) as Record<string, unknown>;
    const image =
      pickFirstImage(product.images) ||
      getProductDisplayImage({
        images: product.images as ProductLike["images"],
        category: product.category as string,
        subcategory: product.subcategory as string,
        main_category: (cf?.main_category ?? product.category) as string,
      });
    const startingPrice = Number(product.starting_price) || 0;
    const currency = (product.currency as string) || "RON";
    const priceFormatted = `${startingPrice.toLocaleString("ro-RO")} ${currency}`;
    const locFromCf = [cf.auction_location, cf.address, cf.city].find(
      (v: unknown) => typeof v === "string" && String(v).trim()
    );
    const location =
      (product.auction_location as string) ||
      (product.address as string) ||
      (product.city as string) ||
      (typeof locFromCf === "string" ? locFromCf.trim() : "") ||
      (product.county as string) ||
      "București";
    const slug = (product.slug ?? cf.slug ?? product.id) as string;
    const isLicitatiePublica = product.product_type === "licitatii-publice";
    const url = isLicitatiePublica ? `/licitatii-publice/${slug}` : `/live_bid/${slug}`;
    const conditionRaw = (product.condition ?? cf.condition) as string | undefined;
    const conditionStr = conditionRaw != null ? String(conditionRaw).trim() : "";
    const conditionForDisplay = conditionStr || "Nouă";
    const isFreeListing = Boolean(cf.is_free_listing ?? cf.isFreeListing ?? false);

    const rawImage = image || "/no-image-placeholder.svg";
    const imageVersion =
      (product.updated_at as string | undefined) ?? (product.created_at as string | undefined) ?? null;
    const focal = getFocalForImageUrl(
      product as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> },
      rawImage,
    );
    const imageForCard = getCdnImageUrl(rawImage, listingGridTransformOptions(imageVersion, focal ?? null));

    return {
      id: String(product.id),
      title: (product.title as string) || "Fără titlu",
      image: imageForCard,
      price: priceFormatted,
      location,
      condition: conditionForDisplay,
      conditionCode: conditionStr || null,
      createdAt: (product.created_at as string) ?? null,
      url,
      slug,
      address: (product.address ?? product.city ?? null) as string | null,
      category: (product.category as string | undefined) ?? null,
      subcategory: (product.subcategory as string | undefined) ?? null,
      brand: typeof product.brand === "string" ? product.brand : null,
      custom_fields:
        product.custom_fields != null && typeof product.custom_fields === "object"
          ? (product.custom_fields as Record<string, unknown>)
          : null,
      isFreeListing,
      startingPrice,
      currency,
    };
  });
}

/**
 * Returns up to 4 premium listings for the homepage. Cached for 60s for unauthenticated users.
 */
export async function getHomePremiumListings(): Promise<HomePremiumItem[]> {
  return unstable_cache(
    fetchHomePremiumListingsUncached,
    ["home-premium-listings"],
    { revalidate: 60, tags: ["home-premium"] }
  )();
}
