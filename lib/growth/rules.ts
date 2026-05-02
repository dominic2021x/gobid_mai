/**
 * SEO rules evaluation for a URL: indexable, canonical, reasons, robotsDirectives.
 * No external calls; fast and deterministic.
 */

export interface RulesEvaluationResult {
  indexable: boolean;
  canonical: string;
  reasons: string[];
  robotsDirectives: string[];
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

const MAX_QUERY_PARAMS_INDEXABLE = 8;
const LISTING_DETAIL_PATTERNS = [
  /^\/ro\/anunt\/[^/]+$/i,
  /^\/ro\/[^/]+\/[^/]+$/i, // e.g. /ro/category/slug
];
const CATEGORY_ROOT_PATTERN = /^\/ro\/?$/;

function parseUrl(input: string): URL | null {
  try {
    const s = input.trim();
    const url = s.startsWith("http") ? new URL(s) : new URL(s, "https://gobid.ro");
    return url;
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  let path = pathname.replace(/\/+/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

function stripTrackingParams(url: URL): URL {
  const out = new URL(url.href);
  for (const key of TRACKING_PARAMS) {
    out.searchParams.delete(key);
  }
  // Also strip common tracking by prefix
  for (const [k] of Array.from(out.searchParams.entries())) {
    if (
      k.toLowerCase().startsWith("utm_") ||
      k.toLowerCase() === "gclid" ||
      k.toLowerCase() === "fbclid" ||
      k.toLowerCase() === "dclid" ||
      k.toLowerCase() === "msclkid"
    ) {
      out.searchParams.delete(k);
    }
  }
  return out;
}

/**
 * Evaluate a URL for indexability and canonical. No external calls.
 */
export function evaluateUrl(urlInput: string): RulesEvaluationResult {
  const reasons: string[] = [];
  const robotsDirectives: string[] = [];
  const parsed = parseUrl(urlInput);

  if (!parsed) {
    return {
      indexable: false,
      canonical: urlInput,
      reasons: ["Invalid URL"],
      robotsDirectives: ["noindex"],
    };
  }

  const path = normalizePath(parsed.pathname);
  const cleaned = stripTrackingParams(parsed);
  const queryParamCount = cleaned.searchParams.size;

  // Base canonical: origin + path + sorted search params (without tracking)
  const canonicalPath = normalizePath(cleaned.pathname);
  const sortedParams = Array.from(cleaned.searchParams.entries()).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  const canonicalSearch =
    sortedParams.length > 0
      ? "?" + sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
      : "";
  const canonical = `${cleaned.origin}${canonicalPath}${canonicalSearch}`;

  // Rule: too many query params => noindex
  if (queryParamCount > MAX_QUERY_PARAMS_INDEXABLE) {
    reasons.push(
      `Too many query parameters (${queryParamCount} > ${MAX_QUERY_PARAMS_INDEXABLE}); treat as non-indexable`
    );
  }

  // Rule: tracking params present => canonical strips them
  const hadTracking =
    parsed.searchParams.has("utm_source") ||
    parsed.searchParams.has("utm_medium") ||
    parsed.searchParams.has("gclid") ||
    parsed.searchParams.has("fbclid") ||
    Array.from(parsed.searchParams.keys()).some((k) =>
      TRACKING_PARAMS.has(k.toLowerCase())
    );
  if (hadTracking) {
    reasons.push("URL contained tracking parameters; canonical strips them");
  }

  // Indexable: listing detail pages and category roots
  const isListingDetail = LISTING_DETAIL_PATTERNS.some((re) => re.test(path));
  const isCategoryRoot = CATEGORY_ROOT_PATTERN.test(path) || path === "/ro";

  if (isListingDetail) {
    reasons.push("Listing detail page; indexable");
  }
  if (isCategoryRoot) {
    reasons.push("Category root; indexable");
  }

  const indexableByPath = isListingDetail || isCategoryRoot;
  const blockedByParams =
    queryParamCount > MAX_QUERY_PARAMS_INDEXABLE || hadTracking;
  const indexable = indexableByPath && !blockedByParams;

  if (!indexableByPath && !blockedByParams) {
    reasons.push("URL path is not a known listing or category root");
  }
  if (blockedByParams && indexableByPath) {
    reasons.push("Blocked by too many params or tracking; canonical recommended");
  }

  if (indexable) {
    robotsDirectives.push("index", "follow");
  } else {
    robotsDirectives.push("noindex");
  }

  return {
    indexable,
    canonical,
    reasons: reasons.length > 0 ? reasons : ["No specific rule matched"],
    robotsDirectives,
  };
}
