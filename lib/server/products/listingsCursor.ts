/**
 * Keyset pagination cursor for /ro listings.
 * Opaque to clients: base64url(JSON).
 * Legacy: `{ ca, id }` for created_at DESC / id DESC.
 * Extended: `{ k, id, pr?, ca? }` for price sorts and oldest.
 */

export type ListingsCursorKind = "newest" | "oldest" | "pricelow" | "pricehigh";

export interface ListingsCursorPayload {
  ca: string;
  id: string;
}

export interface ListingsExtendedCursorPayload {
  k: ListingsCursorKind;
  id: string;
  /** Price tie-break (coalesced RON). */
  pr?: number;
  /** ISO created_at for oldest / newest branches. */
  ca?: string;
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function encodeListingsCursor(createdAt: Date | string, id: string): string {
  const ca = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  const json = JSON.stringify({ ca, id });
  return toBase64Url(Buffer.from(json, "utf8"));
}

/** Encode keyset cursor for price / oldest sorts (v2 payload includes `k`). */
export function encodeListingsKeysetCursor(payload: ListingsExtendedCursorPayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(Buffer.from(json, "utf8"));
}

export type DecodedListingsCursor = ListingsCursorPayload | ListingsExtendedCursorPayload;

export function decodeListingsCursor(cursor: string): DecodedListingsCursor | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const json = fromBase64Url(cursor.trim()).toString("utf8");
    const o = JSON.parse(json) as Record<string, unknown>;
    if (typeof o?.id !== "string" || !o.id) return null;
    const k = typeof o.k === "string" ? (o.k as ListingsCursorKind) : null;
    if (k === "pricelow" || k === "pricehigh") {
      const pr = typeof o.pr === "number" && Number.isFinite(o.pr) ? o.pr : Number(o.pr);
      if (!Number.isFinite(pr)) return null;
      return { k, id: o.id, pr };
    }
    if (k === "oldest") {
      if (typeof o.ca !== "string" || !o.ca) return null;
      const d = new Date(o.ca);
      if (Number.isNaN(d.getTime())) return null;
      return { k, id: o.id, ca: o.ca };
    }
    if (k === "newest") {
      if (typeof o.ca !== "string" || !o.ca) return null;
      const d = new Date(o.ca);
      if (Number.isNaN(d.getTime())) return null;
      return { k: "newest", id: o.id, ca: o.ca };
    }
    // Legacy newest: { ca, id }
    if (typeof o.ca === "string" && o.ca) {
      const d = new Date(o.ca);
      if (Number.isNaN(d.getTime())) return null;
      return { ca: o.ca, id: o.id };
    }
    return null;
  } catch {
    return null;
  }
}

function isLegacyNewestPayload(d: DecodedListingsCursor): d is ListingsCursorPayload {
  return "ca" in d && !("k" in d);
}

/**
 * Keyset pagination when Prisma ORDER BY matches the cursor kind
 * (includes price + oldest — not valid for enterprise SQL RPC ordering).
 */
export function isListingsKeysetSortOrder(sort: string | undefined, q: string | undefined): boolean {
  const s = (sort ?? "").toLowerCase();
  if (s === "title") return false;
  if (s === "timeleft") return false;
  if (s === "relevant" && (q ?? "").trim().length > 0) {
    const cleanWords = q!
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[&|<>!():*^]/g, ""))
      .filter(Boolean);
    if (cleanWords.length > 0) return false;
  }
  return true;
}

/**
 * `search_ro_listings_enterprise` ends with created_at desc, id desc — opaque cursor is only valid there.
 */
export function isEnterpriseListingsKeysetSort(sort: string | undefined, q: string | undefined): boolean {
  const s = (sort ?? "").toLowerCase();
  if (s === "price_asc" || s === "pricelow" || s === "price_desc" || s === "pricehigh") return false;
  if (s === "title") return false;
  if (s === "timeleft") return false;
  if (s === "date_asc" || s === "oldest") return false;
  if (s === "relevant" && (q ?? "").trim().length > 0) {
    const cleanWords = q!
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[&|<>!():*^]/g, ""))
      .filter(Boolean);
    if (cleanWords.length > 0) return false;
  }
  return true;
}

export function listingsCursorMatchesSort(
  decoded: DecodedListingsCursor | null,
  sort: string | undefined,
  q: string | undefined,
): boolean {
  if (!decoded) return false;
  const s = (sort ?? "").toLowerCase();
  if (isLegacyNewestPayload(decoded)) {
    return (
      isEnterpriseListingsKeysetSort(sort, q) &&
      (s === "" || s === "newest" || s === "date_desc" || s === "relevant")
    );
  }
  if (!("k" in decoded)) return false;
  if (decoded.k === "pricelow") return s === "price_asc" || s === "pricelow";
  if (decoded.k === "pricehigh") return s === "price_desc" || s === "pricehigh";
  if (decoded.k === "oldest") return s === "date_asc" || s === "oldest";
  if (decoded.k === "newest") return s === "" || s === "newest" || s === "date_desc" || s === "relevant";
  return false;
}
