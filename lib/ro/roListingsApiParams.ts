/**
 * Query params forwarded from the /ro URL to GET /api/ro/listings (load more, parity with server query).
 */

import {
  RO_LISTINGS_SUPPORTED_PARAM_KEYS,
  sanitizeRoListingsSearchParams,
} from "./normalizedListingsQuery";

/** Keys accepted by /api/ro/listings — do not forward unrelated URL noise. */
export const LISTINGS_ALLOWED_KEYS = RO_LISTINGS_SUPPORTED_PARAM_KEYS;

/** Text-based location filters — mutually exclusive with geo (`nearLat`/`nearLng`) on the same request. */
const RO_LISTING_TEXT_LOCATION_KEYS = ["location", "locations", "city", "county"] as const;

/**
 * Enforce a single location mode so `/api/ro/listings` never mixes resolved coords with text location params.
 *
 * - `geo`: keep only nearLat/nearLng (+ radius when set elsewhere); strip city/county/location.*
 * - `location`: text/county/city (+ optional radius around that area); strip only geo carry-over from URL.
 */
export function applyRoListingsFetchLocationMode(sp: URLSearchParams, mode: "geo" | "location"): void {
  if (mode === "geo") {
    for (const k of RO_LISTING_TEXT_LOCATION_KEYS) {
      sp.delete(k);
    }
  } else {
    sp.delete("nearLat");
    sp.delete("nearLng");
  }
}

export function buildListingsApiParams(
  sp: URLSearchParams,
  from: number,
  limit: number,
  cursor?: string | null
): URLSearchParams {
  const params = new URLSearchParams();
  const cleanedSource = sanitizeRoListingsSearchParams(sp);
  if (cursor) {
    params.set("cursor", cursor);
    params.set("from", "0");
  } else {
    params.set("from", String(Math.max(0, from)));
  }
  params.set("limit", String(Math.min(100, Math.max(1, limit))));
  for (const [k, v] of cleanedSource.entries()) {
    if (!LISTINGS_ALLOWED_KEYS.has(k)) continue;
    if (v == null || String(v).trim() === "") continue;
    if (k === "from" || k === "limit" || k === "cursor") continue;
    // Paginarea API folosește `from` + `limit`; `page` rămâne doar în URL-ul browserului.
    // Altfel apar cereri gen from=54&page=2 — ambigue și pot încetini cache-ul / dedup-ul.
    if (k === "page") continue;
    params.set(k, v);
  }
  return params;
}
