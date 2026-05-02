/**
 * Shared HTTP semantics for Netopia / PayU / premium / tokens payment routes.
 * Prevents CDN/browser caching of payment responses and Next.js Data Cache on upstream fetches.
 */

import { NextResponse } from "next/server";

/**
 * Route handlers must export these as literal strings in each `route.ts` — Next.js parses them at compile time:
 *   export const dynamic = "force-dynamic";
 *   export const fetchCache = "force-no-store";
 */

/** Safe for payment API JSON, redirects, and IPN/XML bodies (CDN + browser must not cache). */
export const PAYMENT_CACHE_CONTROL =
  "no-store, no-cache, must-revalidate, private";

function mergeNoStore(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", PAYMENT_CACHE_CONTROL);
  }
  return { ...init, headers };
}

export function paymentJson<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, mergeNoStore(init));
}

export function paymentRedirect(url: URL | string, init?: ResponseInit): NextResponse {
  return NextResponse.redirect(url, mergeNoStore(init));
}

export function paymentRaw(body: BodyInit | null, init?: ResponseInit): NextResponse {
  return new NextResponse(body, mergeNoStore(init));
}
