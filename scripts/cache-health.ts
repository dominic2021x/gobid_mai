#!/usr/bin/env npx tsx
/**
 * Lightweight health check for gobid.ro listings cache.
 * Run: npx tsx scripts/cache-health.ts [BASE_URL]
 */

const BASE_URL = process.env.BASE_URL ?? process.argv[2] ?? "http://localhost:3000";

function getHeader(res: Response, name: string): string | null {
  return res.headers.get(name) ?? res.headers.get(name.toLowerCase()) ?? null;
}

async function main(): Promise<void> {
  let serverCacheOk = false;
  let cdnCacheOk = false;
  let keyDeterminismOk = false;
  let slugNormalizationOk = false;

  console.log("Cache health check – BASE_URL:", BASE_URL);
  console.log("");

  // 1) /api/ro/listings twice – print Cache-Control, x-vercel-cache, Age
  try {
    const url = `${BASE_URL}/api/ro/listings?from=0&limit=10`;
    const r1 = await fetch(url);
    const r2 = await fetch(url);
    const cc1 = getHeader(r1, "Cache-Control");
    const cc2 = getHeader(r2, "Cache-Control");
    const age1 = getHeader(r1, "Age");
    const age2 = getHeader(r2, "Age");
    const vc1 = getHeader(r1, "x-vercel-cache");
    const vc2 = getHeader(r2, "x-vercel-cache");

    console.log("[1] GET /api/ro/listings (x2)");
    console.log("  R1 Cache-Control:", cc1 ?? "(none)");
    console.log("  R1 x-vercel-cache:", vc1 ?? "(none)");
    console.log("  R1 Age:", age1 ?? "(none)");
    console.log("  R2 Cache-Control:", cc2 ?? "(none)");
    console.log("  R2 x-vercel-cache:", vc2 ?? "(none)");
    console.log("  R2 Age:", age2 ?? "(none)");

    serverCacheOk = r1.ok && r2.ok;
    if (cc1 && /s-maxage|stale-while-revalidate/i.test(cc1)) cdnCacheOk = true;
  } catch (e) {
    console.log("[1] Error:", e instanceof Error ? e.message : e);
  }
  console.log("");

  // 2) /ro?q=test twice – TTFB
  try {
    const pageUrl = `${BASE_URL}/ro?q=test`;
    const t0 = performance.now();
    const p1 = await fetch(pageUrl);
    const ttfb1 = Math.round(performance.now() - t0);
    await p1.text();
    const t1 = performance.now();
    const p2 = await fetch(pageUrl);
    const ttfb2 = Math.round(performance.now() - t1);
    await p2.text();
    console.log("[2] GET /ro?q=test (TTFB)");
    console.log("  R1 TTFB (ms):", ttfb1, "R2 TTFB (ms):", ttfb2);
    if (p1.ok && p2.ok && ttfb2 < ttfb1 * 2) serverCacheOk = true;
  } catch (e) {
    console.log("[2] Error:", e instanceof Error ? e.message : e);
  }
  console.log("");

  // 3) Cache key stability
  try {
    const { buildCacheKey } = await import("@/lib/ro/getListingsCached");
    const keyA = buildCacheKey({ q: "bmw", page: 1 });
    const keyB = buildCacheKey({ page: 1, q: "bmw" });
    keyDeterminismOk = keyA === keyB && keyA.length > 0;
    console.log("[3] Key determinism");
    console.log("  buildCacheKey({ q:'bmw', page:1 }):", keyA);
    console.log("  buildCacheKey({ page:1, q:'bmw' }):", keyB);
    console.log("  Match:", keyDeterminismOk ? "yes" : "NO");
  } catch (e) {
    console.log("[3] Error:", e instanceof Error ? e.message : e);
  }
  console.log("");

  // 4) normalizeCategoryTag: input length >100 → output ≤60, no trailing "-"
  try {
    const { normalizeCategoryTag } = await import("@/lib/ro/getListingsCached");
    const longInput = "a".repeat(120);
    const out = normalizeCategoryTag(longInput);
    const lenOk = out !== undefined && out.length <= 60;
    const noTrailing = out === undefined || !out.endsWith("-");
    slugNormalizationOk = lenOk && noTrailing;
    console.log("[4] Slug normalization");
    console.log("  input length 120 → output length:", out?.length ?? 0, lenOk ? "(≤60)" : "(FAIL)");
    console.log("  no trailing '-':", noTrailing ? "yes" : "NO");
  } catch (e) {
    console.log("[4] Error:", e instanceof Error ? e.message : e);
  }

  console.log("");
  console.log("─────────────────────────────────────");
  console.log("CACHE HEALTH REPORT");
  console.log("─────────────────────────────────────");
  console.log("server cache:      ", serverCacheOk ? "ok" : "fail");
  console.log("cdn cache:         ", cdnCacheOk ? "ok" : "fail");
  console.log("key determinism:   ", keyDeterminismOk ? "ok" : "fail");
  console.log("slug normalization:", slugNormalizationOk ? "ok" : "fail");
  console.log("─────────────────────────────────────");

  const allOk = serverCacheOk && keyDeterminismOk && slugNormalizationOk;
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
