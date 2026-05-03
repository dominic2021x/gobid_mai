import type { RawRoSearchParams } from "@/lib/ro/normalizedListingsQuery";
import {
  normalizeRoListingsSearchParams,
  rawRoSearchParamsToURLSearchParams,
} from "@/lib/ro/normalizedListingsQuery";
import {
  resolveLocationCenter,
  type ResolvedLocationCenter,
} from "@/lib/server/locations/resolveLocationCenter";
import { roundRoListingGeoCoord } from "@/lib/ro/roGeoRound";

/**
 * Inject nearLat/nearLng before normalize/listings RPC when URL has location/city/county but no center.
 * Makes SSR + first API hit distance-first without waiting for client geocode.
 */
export async function enrichRoListingsRawSearchParamsWithResolvedCenter(
  raw: RawRoSearchParams,
): Promise<{ enriched: RawRoSearchParams; resolved: ResolvedLocationCenter | null }> {
  const sp = rawRoSearchParamsToURLSearchParams(raw);
  const normalized = normalizeRoListingsSearchParams(sp);
  const q = normalized.query;
  const hasCenter =
    q.near_lat != null &&
    q.near_lng != null &&
    Number.isFinite(q.near_lat) &&
    Number.isFinite(q.near_lng);
  if (hasCenter) {
    const enriched: RawRoSearchParams = { ...raw };
    enriched.nearLat = String(roundRoListingGeoCoord(q.near_lat!));
    enriched.nearLng = String(roundRoListingGeoCoord(q.near_lng!));
    return { enriched, resolved: null };
  }

  const location = sp.get("location")?.trim();
  const city = sp.get("city")?.trim();
  const county = sp.get("county")?.trim();
  if (!location && !city && !county) {
    return { enriched: { ...raw }, resolved: null };
  }

  const resolved = await resolveLocationCenter({ location, city, county });
  if (!resolved) {
    return { enriched: { ...raw }, resolved: null };
  }

  const enriched: RawRoSearchParams = { ...raw };
  enriched.nearLat = String(roundRoListingGeoCoord(resolved.lat));
  enriched.nearLng = String(roundRoListingGeoCoord(resolved.lng));
  return { enriched, resolved };
}
