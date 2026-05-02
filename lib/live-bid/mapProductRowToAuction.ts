/**
 * Maps a Supabase `products` row to the auction shape used by /live_bid/[slug].
 * Shared between server prefetch and client hydration.
 */
import { isPlausibleProductImageSource } from "@/lib/image/isPlausibleProductImageSource";

/** Normalize JSONB / serialized shapes so SSR și client hidratează la fel. */
function parseProductCustomFields(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function collectPlausibleImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const img of raw) {
    if (typeof img === "string") {
      if (isPlausibleProductImageSource(img)) out.push(img);
      continue;
    }
    if (img && typeof img === "object" && "url" in img) {
      const u = (img as { url?: unknown }).url;
      if (typeof u === "string" && isPlausibleProductImageSource(u)) out.push(u);
    }
  }
  return out;
}

export interface LiveBidAuction {
  id: string;
  slug?: string;
  title: string;
  description: string;
  sku?: string;
  currentBid: number;
  startingBid: number;
  startingBidRON?: number;
  startingBidEUR?: number;
  exchangeRate?: number;
  image: string;
  images: string[];
  category: string;
  subcategory: string;
  location: string;
  brand?: string;
  category_level_3?: string;
  county?: string;
  city?: string;
  village?: string;
  auctionDate?: string;
  address?: string;
  customFields?: Record<string, unknown>;
  isEvaluationPrice?: boolean;
  bidIncrement?: number;
  bidCount?: number;
  status?: "draft" | "active" | "deleted" | "reserved" | "sold";
  documents?: Array<{
    name: string;
    url?: string;
    size?: number;
    type?: string;
  }>;
  imageVersionAt?: string | number | null;
  image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }>;
}

export function mapProductRowToAuction(row: Record<string, unknown>): LiveBidAuction {
  const placeholderImage = "/no-image-placeholder.svg";
  const parsedCustomFields = parseProductCustomFields(row?.custom_fields);

  let images = collectPlausibleImageUrls(row?.images);

  const anafImageIndex = images.findIndex(
    (img: string) =>
      typeof img === "string" && (img.includes("/anaf/") || img.includes("/uploads/anaf/")),
  );

  if (anafImageIndex > 0) {
    const anafImage = images[anafImageIndex];
    images = [anafImage, ...images.filter((_: unknown, idx: number) => idx !== anafImageIndex)];
  }

  const mainImage = (images[0] as string) || placeholderImage;
  const startingPriceRON =
    typeof row?.starting_price_ron === "number"
      ? row.starting_price_ron
      : typeof row?.starting_price === "number"
        ? row.starting_price
        : 0;

  const startingPriceEURRaw = typeof row?.starting_price_eur === "number" ? row.starting_price_eur : 0;

  let exchangeRate: number =
    typeof row?.exchange_rate === "number"
      ? row.exchange_rate
      : typeof parsedCustomFields.exchange_rate === "number"
        ? (parsedCustomFields.exchange_rate as number)
        : 0;

  if (!exchangeRate || exchangeRate <= 0) {
    if (startingPriceRON > 0 && startingPriceEURRaw > 0) {
      const implied = startingPriceRON / startingPriceEURRaw;
      if (implied > 3 && implied < 7) {
        exchangeRate = implied;
      }
    }
  }

  if (!exchangeRate || exchangeRate <= 0) {
    exchangeRate = 5.0;
  }

  const calculatedEUR =
    startingPriceRON > 0
      ? startingPriceRON / exchangeRate
      : startingPriceEURRaw > 0
        ? startingPriceEURRaw
        : 0;

  const documents = Array.isArray(row?.documents)
    ? (row.documents as unknown[]).map((doc: unknown) => {
        const d = doc as Record<string, unknown>;
        return {
          name: (d?.name as string) || "Document",
          url: (d?.url as string) || (d?.publicUrl as string) || undefined,
          size: typeof d?.size === "number" ? d.size : undefined,
          type: d?.type as string | undefined,
        };
      })
    : [];

  const baseCustomFields = parsedCustomFields;
  const cat = ((row?.category as string) ?? "").toLowerCase();
  const subcat = ((row?.subcategory as string) ?? "").toLowerCase();
  const isImobiliare =
    cat.includes("imobiliare") ||
    (cat.includes("executari") && subcat.includes("exec-imobiliare")) ||
    [
      "apartamente",
      "case-vile",
      "case",
      "terenuri",
      "terenuri-intravilane",
      "terenuri-agricole",
      "spatii-comerciale",
      "hale-industriale",
    ].some((s) => subcat.includes(s));
  const customFields = { ...baseCustomFields };
  if (isImobiliare) {
    if (row?.address && !customFields.address) customFields.address = row.address;
    if (row?.auction_location && !customFields.auction_location)
      customFields.auction_location = row.auction_location;
    if (row?.product_location && !customFields.product_location)
      customFields.product_location = row.product_location;
  } else if (row?.product_location && !customFields.product_location) {
    /** Piese auto / marketplace: locația e în coloană + JSONB; fără asta `buildPieseAutoLocationString` nu vede `product_location`. */
    customFields.product_location = row.product_location;
  }

  const firstNonEmptyString = (...vals: unknown[]): string | undefined => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };

  const countyResolved = firstNonEmptyString(
    customFields.county,
    customFields.judet,
    (customFields as Record<string, unknown>)["județ"],
    row?.county,
  );
  const cityResolved = firstNonEmptyString(
    customFields.city,
    customFields.localitate,
    customFields.oras,
    row?.city,
  );

  const locationResolved =
    firstNonEmptyString(
      customFields.locatie,
      row?.product_location,
      customFields.product_location,
      row?.auction_location,
      row?.address,
      cityResolved,
      countyResolved && cityResolved ? `${cityResolved}, ${countyResolved}` : undefined,
      countyResolved,
    ) ?? "București";

  return {
    id: (row?.id as string) ?? "",
    slug: (row?.slug as string) ?? "",
    title: (row?.title as string) ?? "Produs licitație",
    description: (row?.description as string) ?? "",
    sku: typeof row?.sku === "string" ? row.sku : undefined,
    currentBid: startingPriceRON,
    startingBid: startingPriceRON,
    startingBidRON: startingPriceRON,
    startingBidEUR: calculatedEUR,
    exchangeRate: exchangeRate,
    image: mainImage,
    images: images.length > 0 ? (images as string[]) : [mainImage],
    category: (((row?.category as string) ?? "").trim() || "diverse"),
    subcategory: (((row?.subcategory as string) ?? "").trim() || "diverse"),
    brand: typeof row?.brand === "string" ? row.brand : undefined,
    category_level_3: typeof row?.category_level_3 === "string" ? row.category_level_3 : undefined,
    county: countyResolved,
    city: cityResolved,
    village: firstNonEmptyString(customFields.village, customFields.sat, row?.village),
    location: locationResolved,
    auctionDate: (row?.auction_date as string) ?? undefined,
    address: (row?.address as string) ?? undefined,
    customFields,
    isEvaluationPrice: (() => {
      const subcategoryLower = ((row?.subcategory as string) ?? "").toLowerCase();
      const isVehicle =
        subcategoryLower.includes("autoturisme") ||
        subcategoryLower.includes("autovehicule") ||
        subcategoryLower.includes("suv") ||
        subcategoryLower.includes("motociclete") ||
        subcategoryLower.includes("scutere");
      const cf = parsedCustomFields;
      const hasEvaluationPrice =
        cf?.pret_evaluare || cf?.pretEvaluare || (row as Record<string, unknown>)?.pret_evaluare;
      return isVehicle || !!hasEvaluationPrice;
    })(),
    documents,
    status: (row?.status as LiveBidAuction["status"]) ?? "active",
    imageVersionAt: (row?.updated_at as string | number | null) ?? (row?.created_at as string | number | null) ?? null,
    image_focal_by_url:
      row?.image_focal_by_url && typeof row.image_focal_by_url === "object"
        ? (row.image_focal_by_url as Record<string, { focal_x: number; focal_y: number }>)
        : undefined,
  };
}
