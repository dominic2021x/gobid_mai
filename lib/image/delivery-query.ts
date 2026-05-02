/**
 * Canonical query ordering for signed delivery URLs — stable CDN/browser cache keys
 * regardless of client parameter order.
 */
export const DELIVER_QUERY_KEYS = ["dpr", "exp", "ext", "hash", "sig", "w"] as const;

export type DeliverQueryKey = (typeof DELIVER_QUERY_KEYS)[number];

/**
 * Rebuilds the URL with search params in canonical order (dpr → exp → ext → hash → sig → w).
 * Preserves pathname and origin (supports Worker on a custom path).
 */
export function buildCanonicalDeliverUrl(incoming: URL): URL {
  const out = new URL(incoming.href);
  const ordered = new URLSearchParams();
  for (const k of DELIVER_QUERY_KEYS) {
    const v = incoming.searchParams.get(k);
    if (v !== null) ordered.set(k, v);
  }
  out.search = ordered.toString();
  return out;
}

export function isDeliverUrlCanonical(incoming: URL): boolean {
  const c = buildCanonicalDeliverUrl(incoming);
  return incoming.origin === c.origin && incoming.pathname === c.pathname && incoming.search === c.search;
}
