/** Paginare listări /ro — aliniat cu GET /api/ro/listings și buildQueryFromParams. */

/** Mobil (< breakpoint Tailwind `md`, gestionat în client). */
export const RO_LISTINGS_PAGE_SIZE_MOBILE = 18;

/** Desktop și implicit SSR când lipsește `limit` în URL. */
export const RO_LISTINGS_PAGE_SIZE_DESKTOP = 24;

/** Alias pentru cod existent / defaults server: aceeași valoare ca desktop. */
export const RO_LISTINGS_PAGE_SIZE = RO_LISTINGS_PAGE_SIZE_DESKTOP;

/** Heuristică UA pentru primul HTML (clientul corectează apoi la viewport real). */
export function isRoListingsMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  if (/\btablet\b/.test(ua) && !/mobile/.test(ua)) return false;
  return /iphone|ipod|android.*mobile|webos|blackberry|iemobile|opera mini|mobile/i.test(ua);
}

/** Dacă URL-ul nu are `limit`, setează 18 (mobil UA) sau 24 (altfel) înainte de normalizare SSR/cache. */
export function mergeDefaultRoListingsLimitForSsr(
  raw: Record<string, string | string[] | undefined>,
  userAgent: string | null | undefined,
): Record<string, string | string[] | undefined> {
  const limRaw = raw.limit;
  const first = Array.isArray(limRaw) ? limRaw[0] : limRaw;
  if (first != null && String(first).trim() !== "") return raw;
  const limit = isRoListingsMobileUserAgent(userAgent) ? RO_LISTINGS_PAGE_SIZE_MOBILE : RO_LISTINGS_PAGE_SIZE_DESKTOP;
  return { ...raw, limit: String(limit) };
}

/** Plafon sanitar pentru ?page= (evită offset absurd); poate fi ridicat dacă e nevoie. */
export const RO_LISTINGS_MAX_PAGE = 2_000_000;
