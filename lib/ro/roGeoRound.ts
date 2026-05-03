/**
 * Round geo coords sent to search_ro_listings_enterprise (~111 m at RO latitudes).
 * Stabilizes Next.js cache keys and RPC parameter cardinality.
 */
export function roundRoListingGeoCoord(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1000) / 1000;
}
