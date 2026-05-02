import { unstable_cache } from "next/cache";
import type { HomeActiveAuction } from "@/app/(site)/home/types";
import { getProductDisplayImage, type ProductLike } from "@/lib/getProductDisplayImage";
import { supabaseAdmin } from "@/lib/supabase";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";

type ProductRow = {
  id?: string;
  title?: string;
  slug?: string | null;
  images?: ProductLike["images"];
  starting_price?: number | string | null;
  currency?: string | null;
  auction_date?: string | null;
  city?: string | null;
  county?: string | null;
  address?: string | null;
  category?: string | null;
  subcategory?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

let lastSuccessfulHomeActiveAuctions: HomeActiveAuction[] | null = null;

function calculateTimerSeconds(auctionDate?: string | null): number {
  if (!auctionDate) return 24 * 3600;
  const end = new Date(auctionDate);
  if (Number.isNaN(end.getTime())) return 24 * 3600;
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.floor(diff / 1000);
}

function getEffectiveAuctionDateIso(product: Pick<ProductRow, "auction_date" | "custom_fields">): string | undefined {
  const isRollingDaily = product.custom_fields?.auction_rolling_daily === true;
  const isRollingWeekly = product.custom_fields?.rolling_weekly_weekday != null;
  const rawDate = product.auction_date;

  const isDateInPast = (raw: string | undefined): boolean => {
    if (!raw || !String(raw).trim()) return true;
    const s = String(raw).trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    let d: Date;
    if (isoMatch) {
      d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    } else if (euMatch) {
      d = new Date(parseInt(euMatch[3], 10), parseInt(euMatch[2], 10) - 1, parseInt(euMatch[1], 10), 12, 0, 0);
    } else {
      d = new Date(s.slice(0, 10) + "T12:00:00");
    }
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() < today.getTime();
  };

  if (isRollingDaily || isRollingWeekly) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  }

  if (rawDate && isDateInPast(rawDate)) {
    const next = new Date();
    next.setDate(next.getDate() + 30);
    next.setHours(12, 0, 0, 0);
    return next.toISOString();
  }

  return rawDate ?? undefined;
}

async function fetchHomeActiveAuctionsUncached(): Promise<HomeActiveAuction[]> {
  if (!supabaseAdmin) return [];
  const admin = supabaseAdmin;
  const { data, error } = await runPostgrestQuery<ProductRow[]>(
    (signal) =>
      admin
        .from("products")
        .select(
          "id, title, slug, images, starting_price, currency, auction_date, city, county, address, custom_fields, category, subcategory"
        )
        .eq("product_type", "licitatii-publice")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(12)
        .abortSignal(signal),
    { timeoutMs: 5000, maxRetries: 0, retryDelayMs: 250 }
  );

  if (error) throw error;

  const visibleRows = ((data as ProductRow[] | null) ?? []).filter((product) => {
    return !((product.custom_fields as Record<string, unknown> | null)?.is_fixed_price);
  });

  return visibleRows.slice(0, 4).map((product) => {
    const mainCat = (product.custom_fields as Record<string, unknown> | null)?.main_category ?? product.category;
    const image =
      getProductDisplayImage({
        images: product.images,
        category: product.category ?? undefined,
        subcategory: product.subcategory ?? undefined,
        main_category: typeof mainCat === "string" ? mainCat : (product.category ?? undefined),
      }) || "/no-image-placeholder.svg";
    const startingPrice = Number(product.starting_price) || 0;
    const currency = product.currency || "RON";
    const price = `${startingPrice.toLocaleString("ro-RO")} ${currency}`;
    const location =
      [product.city, product.county, product.address].filter(Boolean).join(", ") || "Locatie neprecizată";
    const effectiveDate = getEffectiveAuctionDateIso(product);

    return {
      id: String(product.id ?? ""),
      title: product.title || "Fără titlu",
      image,
      timerSeconds: calculateTimerSeconds(effectiveDate ?? product.auction_date),
      auctionDate: effectiveDate ?? product.auction_date,
      price,
      location,
      tokenCost: 1,
      url: `/licitatii-publice/${product.slug ?? product.id}`,
      slug: String(product.slug ?? product.id ?? ""),
    };
  });
}

export async function getHomeActiveAuctions(): Promise<HomeActiveAuction[]> {
  const cachedFetch = unstable_cache(fetchHomeActiveAuctionsUncached, ["home-active-auctions-v3"], {
    revalidate: 60,
    tags: ["home-active-auctions", "ro-listings"],
  });

  try {
    const result = await cachedFetch();
    lastSuccessfulHomeActiveAuctions = result;
    return result;
  } catch (error) {
    if (lastSuccessfulHomeActiveAuctions) {
      console.warn("[home] Falling back to last successful active executari listings snapshot.");
      return lastSuccessfulHomeActiveAuctions;
    }
    throw error;
  }
}
