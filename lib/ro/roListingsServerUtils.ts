import type { ListingsCacheParams } from "@/lib/ro/getListingsCached";

/** Convert Decimal/object price fields to plain numbers for Client Component serialization. */
export function serializeListingForClient<T extends Record<string, unknown>>(item: T): T {
  const toNum = (v: unknown): number | null =>
    v == null ? null : typeof v === "number" ? v : Number(v);
  return {
    ...item,
    starting_price: toNum((item as any).starting_price) ?? undefined,
    starting_price_ron: toNum((item as any).starting_price_ron) ?? undefined,
    starting_price_eur: toNum((item as any).starting_price_eur) ?? undefined,
    custom_fields:
      (item as any).custom_fields != null
        ? JSON.parse(JSON.stringify((item as any).custom_fields))
        : (item as any).custom_fields,
  } as T;
}

export function toListingsCacheParams(
  raw: Record<string, string | string[] | undefined>
): ListingsCacheParams {
  const get = (k: string) => {
    const v = raw[k];
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
  };
  const page = Number(get("page"));
  const limit = Number(get("limit"));
  return {
    q: get("q"),
    category: get("category") ?? get("categorie"),
    county: get("county"),
    city: get("city"),
    sort: get("sort"),
    page: Number.isFinite(page) ? page : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
    scope:
      get("scope") === "live_bid" || get("scope") === "executari"
        ? (get("scope") as "live_bid" | "executari")
        : undefined,
  };
}
