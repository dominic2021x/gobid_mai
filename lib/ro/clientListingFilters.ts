import { haversineDistanceKm, parseCoordinatesJson } from "../geo/haversine";

export type RoClientDisplayState =
  | "initial"
  | "loadingExact"
  | "showingExact"
  | "loadingRelaxed"
  | "showingRelaxed";

export interface GeoCenter {
  lat: number;
  lng: number;
}

export function getListingIdentity(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  return String(record.id ?? record.slug ?? record.productDbId ?? "");
}

export function dedupeListingsByIdentity<T>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getListingIdentity(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(item);
  }
  return result;
}

export function sortListingsByGeoDistance<T extends Record<string, unknown>>(
  items: T[],
  center?: GeoCenter | null,
): T[] {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return items;
  return [...items]
    .map((item, index) => {
      const point =
        parseCoordinatesJson(item.coordinates) ||
        parseCoordinatesJson((item.custom_fields as Record<string, unknown> | undefined)?.coordinates);
      return {
        item,
        index,
        distanceKm: point ? haversineDistanceKm(center, point) : null,
      };
    })
    .sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function getExplicitDisplayState({
  mounted,
  exactCount,
  relaxedCount,
  loadingExact,
  loadingRelaxed,
}: {
  mounted: boolean;
  exactCount: number;
  relaxedCount: number;
  loadingExact: boolean;
  loadingRelaxed: boolean;
}): RoClientDisplayState {
  if (!mounted) return "initial";
  if (exactCount > 0) return loadingExact ? "loadingExact" : "showingExact";
  if (loadingExact) return "loadingExact";
  if (relaxedCount > 0) return loadingRelaxed ? "loadingRelaxed" : "showingRelaxed";
  return loadingRelaxed ? "loadingRelaxed" : "showingExact";
}

export function buildRelaxedSuggestionList<T>(exactItems: T[], relaxedItems: T[], limit: number): T[] {
  const exactIds = new Set(exactItems.map(getListingIdentity).filter(Boolean));
  return dedupeListingsByIdentity(relaxedItems)
    .filter((item) => {
      const key = getListingIdentity(item);
      return !key || !exactIds.has(key);
    })
    .slice(0, Math.max(0, limit));
}
