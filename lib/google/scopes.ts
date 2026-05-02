/**
 * Minimal OAuth scopes per Google product for Growth Center.
 * buildScopes(products) returns union of scopes for selected products.
 */

export const GOOGLE_PRODUCTS = [
  "search_console",
  "google_ads",
  "ga4",
  "tag_manager",
] as const;

export type GoogleProduct = (typeof GOOGLE_PRODUCTS)[number];

export const SCOPES: Record<GoogleProduct, string[]> = {
  search_console: [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/webmasters",
  ],
  google_ads: [
    "https://www.googleapis.com/auth/adwords",
  ],
  ga4: [
    "https://www.googleapis.com/auth/analytics.readonly",
  ],
  tag_manager: [
    "https://www.googleapis.com/auth/tagmanager.readonly",
  ],
};

/**
 * Return minimal scopes for the given products (union, no duplicates).
 */
export function buildScopes(products: GoogleProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const list = SCOPES[p];
    if (list) for (const s of list) set.add(s);
  }
  return Array.from(set);
}

/**
 * Parse products from query string e.g. "search_console,google_ads,ga4".
 * Returns only valid GoogleProduct values.
 */
export function parseProductsQuery(query: string | null): GoogleProduct[] {
  if (!query || typeof query !== "string") return ["search_console"];
  const list = query.split(",").map((s) => s.trim().toLowerCase());
  const valid = GOOGLE_PRODUCTS as unknown as string[];
  return list.filter((p): p is GoogleProduct => valid.includes(p));
}
