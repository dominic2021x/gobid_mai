"use client";

import {
  getRoReturnStateStorageKey,
  listingIdsMatchForReturn,
  parseRoListingReturnPayload,
  readRoListingReturnStateRaw,
  RO_LISTING_RETURN_TTL_MS,
} from "./listingReturnState";

export type ListingDetailRouter = {
  back: () => void;
  push: (href: string) => void;
};

/**
 * Înapoi unificat de pe /live_bid/* și /licitatii-publice/*: reconstruiește /ro?… din storage
 * când utilizatorul a deschis anunțul din listă (listingId coincide), altfel history.back / fallback.
 */
export function navigateBackFromListingDetail(
  router: ListingDetailRouter,
  options: { currentListingId: string; fallbackHref: string },
): void {
  const { currentListingId, fallbackHref } = options;
  if (typeof window === "undefined") {
    router.push(fallbackHref);
    return;
  }

  const id = String(currentListingId ?? "").trim();
  const key = getRoReturnStateStorageKey();
  const state = parseRoListingReturnPayload(readRoListingReturnStateRaw(key));

  if (state && id) {
    const fresh = Date.now() - state.ts <= RO_LISTING_RETURN_TTL_MS;
    const path = (state.pathname || "/ro").trim() || "/ro";
    const fromRoList = path === "/ro";
    const idOk = listingIdsMatchForReturn(state.listingId, id);
    if (fresh && fromRoList && idOk) {
      const qs = (state.searchSignature ?? "").trim();
      router.push(qs ? `${path}?${qs}` : path);
      return;
    }
  }

  if (window.history.length > 1) {
    router.back();
    return;
  }

  router.push(fallbackHref);
}
