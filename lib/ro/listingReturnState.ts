/**
 * Stare partajată pentru revenirea de pe paginile de detaliu anunț → /ro (scroll + aceeași pagină URL).
 * Folosit de RoAuctionsViewClient și de navigateBackFromListingDetail.
 */

export const RO_LIST_RETURN_STATE_KEY = "ro:listReturnState";
export const RO_LIST_RETURN_TAB_ID_KEY = "ro:listReturnTabId";
export const RO_LISTING_RETURN_TTL_MS = 30 * 60 * 1000;

export interface RoListingReturnPayload {
  searchSignature: string;
  pathname: string;
  page?: number;
  offset?: number;
  limit?: number;
  filtersSignature?: string;
  scrollY?: number;
  listingId: string;
  itemTop?: number | null;
  ts: number;
}

export function normalizeReturnSearchSignature(searchLike: string): string {
  const search = searchLike.startsWith("?") ? searchLike.slice(1) : searchLike;
  const params = new URLSearchParams(search);
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

export function getRoReturnStateStorageKey(): string {
  if (typeof window === "undefined") return RO_LIST_RETURN_STATE_KEY;
  const sessionStore = window.sessionStorage;
  let tabId = sessionStore.getItem(RO_LIST_RETURN_TAB_ID_KEY);
  if (!tabId) {
    tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStore.setItem(RO_LIST_RETURN_TAB_ID_KEY, tabId);
  }
  return `${RO_LIST_RETURN_STATE_KEY}:${tabId}`;
}

/** Aceleași reguli ca la restore pe /ro: fără from/limit și fără geo „live” din URL. */
export function buildRoListingFiltersSignatureForRestore(searchParams: URLSearchParams): string {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete("from");
  sp.delete("limit");
  sp.delete("radiusKm");
  sp.delete("nearLat");
  sp.delete("nearLng");
  const entries = Array.from(sp.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Query pentru GET /api/ro/listings-count — aceleași filtre ca feed-ul, inclusiv rază + centru.
 * (Signature-ul de restore exclude geo; count-ul trebuie să coincidă cu lista curentă.)
 */
export function buildRoListingsCountQueryString(source: URLSearchParams | string): string {
  const sp = new URLSearchParams(typeof source === "string" ? source : source.toString());
  sp.delete("from");
  sp.delete("limit");
  sp.delete("page");
  sp.delete("cursor");
  sp.delete("sort");
  return sp.toString();
}

export function readRoListingReturnStateRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseRoListingReturnPayload(raw: string | null): RoListingReturnPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RoListingReturnPayload>;
    if (!parsed || typeof parsed.ts !== "number") return null;
    return parsed as RoListingReturnPayload;
  } catch {
    return null;
  }
}

export function clearRoListingReturnState(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function listingIdsMatchForReturn(a: string, b: string): boolean {
  const na = String(a ?? "").trim();
  const nb = String(b ?? "").trim();
  if (!na || !nb) return false;
  return na === nb;
}
