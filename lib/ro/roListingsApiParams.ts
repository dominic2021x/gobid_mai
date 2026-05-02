/**
 * Query params forwarded from the /ro URL to GET /api/ro/listings (load more, parity with server query).
 */

import {
  RO_LISTINGS_SUPPORTED_PARAM_KEYS,
  sanitizeRoListingsSearchParams,
} from "./normalizedListingsQuery";

/** Keys accepted by /api/ro/listings — do not forward unrelated URL noise. */
export const LISTINGS_ALLOWED_KEYS = RO_LISTINGS_SUPPORTED_PARAM_KEYS;

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
    params.set(k, v);
  }
  return params;
}
