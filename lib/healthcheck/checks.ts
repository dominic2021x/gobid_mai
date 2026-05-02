/**
 * Health check definitions: pages, API, Supabase.
 * Each check has name, category, target_url, method, optional expected.
 */

export type CheckCategory = "page" | "api" | "supabase" | "external";

export interface CheckDefinition {
  name: string;
  category: CheckCategory;
  target_url: string;
  method: string;
  expected?: { status?: number; contentType?: string };
}

function url(site: string, path: string, query?: Record<string, string>): string {
  const base = site.replace(/\/$/, "");
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  if (!query || Object.keys(query).length === 0) return `${base}${pathNorm}`;
  const params = new URLSearchParams(query);
  return `${base}${pathNorm}?${params.toString()}`;
}

/**
 * Returns all check definitions for the given site base URL (e.g. https://gobid.ro).
 */
export function getCheckDefinitions(siteUrl: string): CheckDefinition[] {
  const site = siteUrl || "https://gobid.ro";

  return [
    // Pages
    { name: "home", category: "page", target_url: url(site, "/"), method: "GET", expected: { status: 200 } },
    { name: "licitatii", category: "page", target_url: url(site, "/licitatii"), method: "GET", expected: { status: 200 } },
    { name: "search", category: "page", target_url: url(site, "/search"), method: "GET", expected: { status: 200 } },
    // API
    { name: "api_exchange_rate", category: "api", target_url: url(site, "/api/exchange-rate"), method: "GET", expected: { status: 200, contentType: "application/json" } },
    { name: "api_search_suggestions", category: "api", target_url: url(site, "/api/search/suggestions", { q: "test" }), method: "GET", expected: { status: 200, contentType: "application/json" } },
    { name: "api_search_results", category: "api", target_url: url(site, "/api/search/results", { q: "test" }), method: "GET", expected: { status: 200, contentType: "application/json" } },
    // Supabase is checked separately in runner (server-side select)
  ];
}

/** Name for the synthetic Supabase check. */
export const SUPABASE_CHECK_NAME = "supabase_products_select";
