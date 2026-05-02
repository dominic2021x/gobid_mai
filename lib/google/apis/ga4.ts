import "server-only";
import { getGoogleAccessToken } from "@/lib/google/client";

const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const FETCH_TIMEOUT_MS = 15000;

export interface GA4Property {
  name: string;
  propertyId: string;
  displayName?: string;
}

/**
 * List GA4 properties (Analytics Admin API). List account summaries then properties.
 * Simplified: use accountSummaries to get property summaries.
 */
export async function listGA4Properties(): Promise<GA4Property[]> {
  const token = await getGoogleAccessToken("ga4");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADMIN_BASE}/accountSummaries`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 API error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      accountSummaries?: Array<{
        propertySummaries?: Array<{
          property: string;
          displayName?: string;
        }>;
      }>;
    };
    const out: GA4Property[] = [];
    for (const acc of data.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        const match = p.property.match(/properties\/(\d+)$/);
        out.push({
          name: p.property,
          propertyId: match ? match[1] : p.property,
          displayName: p.displayName,
        });
      }
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

export interface GA4ReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

/**
 * Pull a simple report (landing page + events) for the given property. propertyId from growth_settings (ga4_property_id).
 */
export async function pullGA4Report(
  propertyId: string,
  days: number = 28
): Promise<{ rows: GA4ReportRow[]; rowCount: number }> {
  const token = await getGoogleAccessToken("ga4");
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${DATA_BASE}/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "landingPage" }, { name: "eventName" }],
          metrics: [{ name: "eventCount" }, { name: "sessions" }],
          limit: 1000,
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 runReport error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: GA4ReportRow[]; rowCount?: number };
    return { rows: data.rows ?? [], rowCount: data.rowCount ?? 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pull sessions by date for traffic quality comparison (Ads clicks vs GA4 sessions).
 */
export async function pullGA4SessionsByDate(
  propertyId: string,
  days: number = 14
): Promise<{ byDate: Map<string, number> }> {
  const token = await getGoogleAccessToken("ga4");
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${DATA_BASE}/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }],
          limit: 31,
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 runReport error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> };
    const byDate = new Map<string, number>();
    for (const row of data.rows ?? []) {
      const dateVal = row.dimensionValues?.[0]?.value ?? "";
      const sessions = Number(row.metricValues?.[0]?.value ?? 0) || 0;
      if (dateVal) byDate.set(dateVal, (byDate.get(dateVal) ?? 0) + sessions);
    }
    return { byDate };
  } finally {
    clearTimeout(timeout);
  }
}

/** Funnel event names used for conversion-system optimization. */
export const FUNNEL_EVENT_NAMES = ["session_start", "signup", "publish_listing", "paid_boost"] as const;

/**
 * Pull event counts by event name for funnel leak detection (session → signup → publish_listing → paid_boost).
 */
export async function pullGA4FunnelEventCounts(
  propertyId: string,
  days: number = 30
): Promise<{ eventCounts: Map<string, number> }> {
  const token = await getGoogleAccessToken("ga4");
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${DATA_BASE}/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          limit: 100,
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GA4 runReport error: ${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> };
    const eventCounts = new Map<string, number>();
    for (const row of data.rows ?? []) {
      const eventName = row.dimensionValues?.[0]?.value ?? "";
      const count = Number(row.metricValues?.[0]?.value ?? 0) || 0;
      if (eventName) eventCounts.set(eventName, (eventCounts.get(eventName) ?? 0) + count);
    }
    return { eventCounts };
  } finally {
    clearTimeout(timeout);
  }
}
