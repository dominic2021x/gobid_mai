import "server-only";
import { getGoogleAccessToken } from "@/lib/google/client";

const BASE = "https://www.googleapis.com/webmasters/v3";
const FETCH_TIMEOUT_MS = 15000;

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel?: string;
}

/**
 * List sites available to the authenticated account (read-only). Fast discovery.
 */
export async function listSearchConsoleSites(): Promise<SearchConsoleSite[]> {
  const token = await getGoogleAccessToken("search_console");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/sites`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search Console API error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
    const entries = data.siteEntry ?? [];
    return entries.map((e) => ({
      siteUrl: e.siteUrl ?? "",
      permissionLevel: e.permissionLevel,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export interface GSCPerformanceRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * Pull search performance for a site (last 7 or 28 days). siteUrl must be stored in growth_settings (gsc_site_url).
 */
export async function pullSearchConsolePerformance(
  siteUrl: string,
  days: 7 | 28 = 7
): Promise<{ rows: GSCPerformanceRow[]; startDate: string; endDate: string }> {
  const token = await getGoogleAccessToken("search_console");
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const encoded = encodeURIComponent(siteUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE}/sites/${encoded}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: 1000,
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search Console searchAnalytics error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };
    const rows = data.rows ?? [];
    return { rows, startDate, endDate };
  } finally {
    clearTimeout(timeout);
  }
}
