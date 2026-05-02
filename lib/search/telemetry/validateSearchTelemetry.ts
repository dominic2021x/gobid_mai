/**
 * Shared validation for search telemetry: event types, payloads, rate limits.
 */

export const SEARCH_TELEMETRY_EVENT_TYPES = [
  "impression",
  "click",
  "submit",
  "save",
  "contact_intent",
  "bid_intent",
  "scroll_depth",
  "query_reformulation",
  "pagination",
] as const;

export type SearchTelemetryEventType = (typeof SEARCH_TELEMETRY_EVENT_TYPES)[number];

export const MAX_QUERY_NORM_LEN = 120;
export const MIN_QUERY_NORM_LEN = 2;
export const RESULTS_CAP = 30;
export const RATE_LIMIT_PER_MIN = 120;
export const RATE_WINDOW_MS = 60_000;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && uuidRe.test(s);
}

export function validateQueryNorm(q: unknown): q is string {
  if (typeof q !== "string") return false;
  const t = q.trim();
  return t.length >= MIN_QUERY_NORM_LEN && t.length <= MAX_QUERY_NORM_LEN;
}

export function validateResultsList(
  results: unknown
): Array<{ id: string; pos: number }> {
  if (!Array.isArray(results)) return [];
  return results
    .slice(0, RESULTS_CAP)
    .map((r) => ({
      id: typeof (r as { id?: string })?.id === "string" ? (r as { id: string }).id : "",
      pos: typeof (r as { pos?: number })?.pos === "number" ? (r as { pos: number }).pos : 0,
    }))
    .filter((r) => r.id);
}
