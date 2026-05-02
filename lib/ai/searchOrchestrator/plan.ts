/**
 * Builds a full query string for GET /api/ro/listings from normalized query + filters.
 * Contract: same params as /api/ro/listings (from, limit, q, category, county, etc.).
 */

export interface ListingsQueryInput {
  q?: string;
  filters?: {
    category?: string;
    subcategory?: string;
    county?: string;
    city?: string;
    location?: string;
    brand?: string;
    color?: string;
    condition?: string;
    priceMin?: number;
    priceMax?: number;
    sort?: string;
  };
  from?: number;
  limit?: number;
}

/**
 * Returns the query string part only (e.g. "q=audi+a4&county=Cluj&from=0&limit=30").
 * Does not include the base path /api/ro/listings.
 */
export function buildListingsQueryString(input: ListingsQueryInput): string {
  const params = new URLSearchParams();
  const from = Math.max(0, input.from ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  params.set("from", String(from));
  params.set("limit", String(limit));

  const q = (input.q ?? "").trim();
  if (q) params.set("q", q);

  const f = input.filters ?? {};
  if (f.category) params.set("category", f.category);
  if (f.subcategory) params.set("subcategory", f.subcategory);
  if (f.county) params.set("county", f.county);
  if (f.city) params.set("city", f.city);
  if (f.location) params.set("location", f.location);
  if (f.brand) params.set("brand", f.brand);
  if (f.color) params.set("color", f.color);
  if (f.condition) params.set("condition", f.condition);
  if (f.priceMin != null) params.set("priceMin", String(f.priceMin));
  if (f.priceMax != null) params.set("priceMax", String(f.priceMax));
  if (f.sort) params.set("sort", f.sort);

  return params.toString();
}

/**
 * Returns full URL path with query string for /api/ro/listings.
 */
export function buildListingsUrl(input: ListingsQueryInput): string {
  const qs = buildListingsQueryString(input);
  return `/api/ro/listings?${qs}`;
}
