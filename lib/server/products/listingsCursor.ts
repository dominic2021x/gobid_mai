/**
 * Keyset pagination cursor for /ro listings (ORDER BY created_at DESC, id DESC).
 * Opaque to clients: base64url(JSON { ca: ISO timestamp, id: uuid }).
 */

export interface ListingsCursorPayload {
  ca: string;
  id: string;
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

export function decodeListingsCursor(cursor: string): ListingsCursorPayload | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const json = fromBase64Url(cursor.trim()).toString("utf8");
    const o = JSON.parse(json) as { ca?: unknown; id?: unknown };
    if (typeof o?.ca === "string" && typeof o?.id === "string" && o.ca && o.id) {
      const d = new Date(o.ca);
      if (Number.isNaN(d.getTime())) return null;
      return { ca: o.ca, id: o.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Keyset pagination works only when Prisma ORDER BY matches (created_at DESC, id DESC).
 * Not compatible with price/title/timeleft/fulltext relevance ordering.
 */
export function isListingsKeysetSortOrder(sort: string | undefined, q: string | undefined): boolean {
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
