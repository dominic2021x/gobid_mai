import {
  getListingsCachedFromFullSearchParams,
  getListingsCountEstimateMetaCachedFromFullSearchParams,
} from "@/lib/ro/getListingsCached";
import { loadPersonalizedRoHomePreview } from "@/lib/ro/personalizedRoHomePreview";
import { getAppliedInternalLinksForSource } from "@/lib/growth/internalLinks";
import { normalizeRoListingsRawSearchParams } from "@/lib/ro/normalizedListingsQuery";
import { normalizeRoListingsSortKey } from "@/lib/ro/roListingsSortParam";
import { mergeDefaultRoListingsLimitForSsr } from "@/lib/ro/roListingsPagination";
import { headers } from "next/headers";
import { resolveAccess } from "@/lib/server/access/resolveAccess";
import { serializeListingForClient } from "@/lib/ro/roListingsServerUtils";
import { RoAuctionsViewClient } from "./RoAuctionsViewClient";
import type { InitialListingsPayload } from "./types";

/**
 * Server Component: cached listings + estimate count for /ro (parity with GET /api/ro/listings).
 * Client receives a JSON snapshot; infinite scroll appends via /api/ro/listings only.
 * Phase 4.1 (optional): split first-fold listings into an async child + `<Suspense>` for earlier LCP.
 */
export default async function RoListServer({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const accessHeaders = await headers();
  const searchParamsWithViewportLimit = mergeDefaultRoListingsLimitForSsr(
    searchParams,
    accessHeaders.get("user-agent"),
  );
  const normalized = normalizeRoListingsRawSearchParams(searchParamsWithViewportLimit);
  /** Aceeași valoare ca în URL după sanitizare — evită mismatch hidratare la `useSearchParams()` în client. */
  const initialMarketplaceQ = normalized.searchParams.get("q")?.trim() ?? "";
  const access = await resolveAccess({ headers: accessHeaders } as Request);

  const page = normalized.query.page ?? 1;
  const allowPersonalizedHome =
    !normalized.hasFilters &&
    (normalized.query.from ?? 0) === 0 &&
    !normalized.query.listingsCursor &&
    page <= 1;

  const [result, resurseUtileLinks, countMeta, personalizedPreviewItems] = await Promise.all([
    getListingsCachedFromFullSearchParams(searchParamsWithViewportLimit, access),
    getAppliedInternalLinksForSource("/ro"),
    getListingsCountEstimateMetaCachedFromFullSearchParams(searchParamsWithViewportLimit, access).catch(
      () => undefined as undefined,
    ),
    allowPersonalizedHome ? loadPersonalizedRoHomePreview(access) : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const plainItems = result.items.map(serializeListingForClient);
  const initialTotal = typeof countMeta?.total === "number" ? countMeta.total : undefined;
  const initialTotalKind = countMeta?.totalKind;
  const initialListings: InitialListingsPayload = {
    items: plainItems,
    nextFrom: result.nextFrom,
    from: normalized.query.from ?? 0,
    pageSize: normalized.query.limit,
    nextCursor: result.nextCursor ?? null,
    hasMore: result.hasMore,
    snapshotSort: normalizeRoListingsSortKey(normalized.searchParams.get("sort")),
    ...(typeof initialTotal === "number" ? { totalCount: initialTotal } : {}),
    ...(initialTotalKind ? { totalKind: initialTotalKind } : {}),
    source: "ssr",
    ...(personalizedPreviewItems.length > 0
      ? { personalizedHomePreview: { items: personalizedPreviewItems } }
      : {}),
  };

  return (
    <RoAuctionsViewClient
      resurseUtileLinks={resurseUtileLinks}
      initialListings={initialListings}
      initialMarketplaceQ={initialMarketplaceQ}
    />
  );
}
