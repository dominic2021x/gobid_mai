/**
 * /ro page — server → client props (JSON-serializable).
 */

export type SerializedRoListing = Record<string, unknown>;

/** SSR: primele anunțuri personalizate pentru /ro fără filtre (din istoric căutări / profil). */
export interface RoPersonalizedHomePreview {
  items: SerializedRoListing[];
}

export interface InitialListingsPayload {
  items: SerializedRoListing[];
  nextFrom: number;
  /** Canonical normalized query offset used for this snapshot. */
  from?: number;
  /** Canonical page size used by SSR and /api/ro/listings when URL has no limit. */
  pageSize?: number;
  /** Keyset cursor when sort is created_at DESC (Prisma path); prefer over nextFrom for load-more. */
  nextCursor?: string | null;
  hasMore: boolean;
  /** Sort folosit la SSR pentru `items` (cheie UI: relevant, newest, priceLow, …). */
  snapshotSort?: string;
  /** Feed total for current URL when known; avoids null flash in header summary. */
  totalCount?: number;
  /** How `totalCount` was produced — mirrors GET /api/ro/listings `total_kind`. */
  totalKind?: "exact" | "estimate" | "capped";
  source?: "ssr";
  personalizedHomePreview?: RoPersonalizedHomePreview;
}

/** SEO internal links for „Resurse utile” — JSON from server (avoid RSC-as-prop → Suspense hydration mismatch). */
export interface ResurseUtileLinkItem {
  target_url: string;
  anchor: string;
}
