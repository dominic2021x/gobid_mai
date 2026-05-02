/**
 * Build feature vector for alert ranking.
 * Deterministic features from listing, saved search, user profile, query stats.
 */

export interface ListingInput {
  id: string;
  county?: string | null;
  city?: string | null;
  category?: string | null;
  created_at?: string | null;
}

export interface SavedSearchInput {
  q_norm: string;
  filters_json?: Record<string, unknown>;
}

export interface UserProfileInput {
  category?: Record<string, number>;
  county?: Record<string, number>;
  top_categories?: Array<{ slug?: string; weight?: number; k?: string; v?: number }>;
  top_counties?: Array<{ slug?: string; weight?: number; k?: string; v?: number }>;
  prefs?: {
    category?: Record<string, number>;
    county?: Record<string, number>;
    top_categories?: Array<{ slug?: string; weight?: number; k?: string; v?: number }>;
    top_counties?: Array<{ slug?: string; weight?: number; k?: string; v?: number }>;
  };
}

export interface QueryStatsInput {
  ctr_7d: number;
  long_click_rate: number;
  pogo_rate: number;
}

export interface AlertFeatures {
  fresh_hours: number;
  same_county: boolean;
  same_category: boolean;
  ctr_7d: number;
  long_click_rate: number;
  pogo_penalty: number;
  user_category_match: number;
  user_county_match: number;
}

function normalizeSlug(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAlertFeatures(opts: {
  listing: ListingInput;
  savedSearch: SavedSearchInput;
  userProfile?: UserProfileInput | null;
  queryStats?: QueryStatsInput | null;
}): AlertFeatures {
  const { listing, savedSearch, userProfile, queryStats } = opts;

  const now = Date.now();
  const created = listing.created_at ? new Date(listing.created_at).getTime() : now;
  const fresh_hours = Math.max(0, (now - created) / (1000 * 60 * 60));

  const searchCounty = (savedSearch.filters_json?.county as string) ?? "";
  const searchCategory = (savedSearch.filters_json?.categorie as string) ?? (savedSearch.filters_json?.category as string) ?? "";
  const listingCounty = normalizeSlug(String(listing.county ?? ""));
  const listingCity = normalizeSlug(String(listing.city ?? ""));
  const listingCategory = normalizeSlug(String(listing.category ?? ""));
  const searchCountyNorm = normalizeSlug(searchCounty);
  const searchCategoryNorm = normalizeSlug(searchCategory);

  const same_county =
    searchCountyNorm && (listingCounty === searchCountyNorm || listingCounty.includes(searchCountyNorm) || listingCity.includes(searchCountyNorm));
  const same_category = searchCategoryNorm && (listingCategory === searchCategoryNorm || listingCategory.includes(searchCategoryNorm));

  let user_category_match = 0;
  let user_county_match = 0;
  const prefs = userProfile?.prefs ?? userProfile;
  if (prefs) {
    const catPrefs = (prefs.category ?? {}) as Record<string, number>;
    const countyPrefs = (prefs.county ?? {}) as Record<string, number>;
    for (const [slug, w] of Object.entries(catPrefs)) {
      const s = normalizeSlug(slug);
      if (s && (listingCategory === s || listingCategory.includes(s))) {
        user_category_match = Math.max(user_category_match, Math.min(1, Number(w) ?? 0));
      }
    }
    for (const [slug, w] of Object.entries(countyPrefs)) {
      const s = normalizeSlug(slug);
      if (s && (listingCounty === s || listingCounty.includes(s) || listingCity.includes(s))) {
        user_county_match = Math.max(user_county_match, Math.min(1, Number(w) ?? 0));
      }
    }
    if (user_category_match === 0) {
      for (const c of (prefs.top_categories ?? []) as Array<{ slug?: string; k?: string; weight?: number; v?: number }>) {
        const slug = normalizeSlug(String(c.slug ?? c.k ?? ""));
        if (slug && (listingCategory === slug || listingCategory.includes(slug))) {
          user_category_match = Math.max(user_category_match, (c.weight ?? c.v ?? 1) as number);
        }
      }
    }
    if (user_county_match === 0) {
      for (const co of (prefs.top_counties ?? []) as Array<{ slug?: string; k?: string; weight?: number; v?: number }>) {
        const slug = normalizeSlug(String(co.slug ?? co.k ?? ""));
        if (slug && (listingCounty === slug || listingCounty.includes(slug) || listingCity.includes(slug))) {
          user_county_match = Math.max(user_county_match, (co.weight ?? co.v ?? 1) as number);
        }
      }
    }
  }

  const stats = queryStats ?? { ctr_7d: 0, long_click_rate: 0, pogo_rate: 0 };
  const ctr_7d = Math.max(0, Math.min(1, Number(stats.ctr_7d) || 0));
  const long_click_rate = Math.max(0, Math.min(1, Number(stats.long_click_rate) || 0));
  const pogo_penalty = Math.max(0, Math.min(1, Number(stats.pogo_rate) || 0));

  return {
    fresh_hours,
    same_county: !!same_county,
    same_category: !!same_category,
    ctr_7d,
    long_click_rate,
    pogo_penalty,
    user_category_match: Math.max(0, Math.min(1, user_category_match)),
    user_county_match: Math.max(0, Math.min(1, user_county_match)),
  };
}
