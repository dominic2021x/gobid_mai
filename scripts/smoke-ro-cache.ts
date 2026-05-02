#!/usr/bin/env npx tsx
/**
 * Smoke tests for /ro listings caching (Node 20+, native fetch).
 * Run: npx tsx scripts/smoke-ro-cache.ts [BASE_URL]
 *      BASE_URL defaults to http://localhost:3000
 */

const BASE_URL = process.env.BASE_URL ?? process.argv[2] ?? "http://localhost:3000";

type Result = { name: string; pass: boolean; detail?: string; timings?: Record<string, number> };

function getHeader(res: Response, name: string): string | null {
  return res.headers.get(name) ?? res.headers.get(name.toLowerCase()) ?? null;
}

async function run(): Promise<void> {
  const results: Result[] = [];
  const listParams = "from=0&limit=10";

  // --- 1) Same params twice, no cookies: print Cache-Control, Age, x-vercel-cache ---
  try {
    const url1 = `${BASE_URL}/api/ro/listings?${listParams}`;
    const res1 = await fetch(url1);
    const res2 = await fetch(url1);

    const cc1 = getHeader(res1, "Cache-Control");
    const cc2 = getHeader(res2, "Cache-Control");
    const age1 = getHeader(res1, "Age");
    const age2 = getHeader(res2, "Age");
    const vc1 = getHeader(res1, "x-vercel-cache");
    const vc2 = getHeader(res2, "x-vercel-cache");

    console.log("\n[1] GET /api/ro/listings (no cookies, same params x2)");
    console.log("  Request 1 - Cache-Control:", cc1 ?? "(none)");
    console.log("  Request 1 - Age:", age1 ?? "(none)");
    console.log("  Request 1 - x-vercel-cache:", vc1 ?? "(none)");
    console.log("  Request 2 - Cache-Control:", cc2 ?? "(none)");
    console.log("  Request 2 - Age:", age2 ?? "(none)");
    console.log("  Request 2 - x-vercel-cache:", vc2 ?? "(none)");

    const pass = res1.ok && res2.ok;
    results.push({
      name: "Listings API twice (no cookies) – 200 + headers logged",
      pass,
      detail: pass ? undefined : `res1=${res1.status} res2=${res2.status}`,
    });
  } catch (e) {
    results.push({
      name: "Listings API twice (no cookies)",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- 2) With fake auth cookie: assert Cache-Control contains no-store ---
  try {
    const url = `${BASE_URL}/api/ro/listings?${listParams}`;
    const res = await fetch(url, {
      headers: {
        Cookie: "next-auth.session-token=fake-token-for-smoke-test",
      },
    });
    const cc = getHeader(res, "Cache-Control") ?? "";
    const hasNoStore = /no-store/i.test(cc);

    console.log("\n[2] GET /api/ro/listings (with auth cookie)");
    console.log("  Cache-Control:", cc || "(none)");
    console.log("  Expect no-store in Cache-Control:", hasNoStore ? "yes" : "NO");

    results.push({
      name: "Listings API with auth cookie → no-store",
      pass: hasNoStore,
      detail: hasNoStore ? undefined : `Cache-Control was: ${cc || "(empty)"}`,
    });
  } catch (e) {
    results.push({
      name: "Listings API with auth cookie",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- 3) /ro?page=1&q=bmw twice, measure TTFB ---
  try {
    const pageUrl = `${BASE_URL}/ro?page=1&q=bmw`;
    const t0 = performance.now();
    const r1 = await fetch(pageUrl);
    const ttfb1 = Math.round(performance.now() - t0);
    await r1.text();

    const t1 = performance.now();
    const r2 = await fetch(pageUrl);
    const ttfb2 = Math.round(performance.now() - t1);
    await r2.text();

    console.log("\n[3] GET /ro?page=1&q=bmw (TTFB)");
    console.log("  Request 1 TTFB (ms):", ttfb1);
    console.log("  Request 2 TTFB (ms):", ttfb2);
    console.log("  Status 1:", r1.status, "Status 2:", r2.status);

    const pass = r1.ok && r2.ok;
    results.push({
      name: "Page /ro?page=1&q=bmw twice – TTFB",
      pass,
      detail: pass ? undefined : `r1=${r1.status} r2=${r2.status}`,
      timings: { ttfb1, ttfb2 },
    });
  } catch (e) {
    results.push({
      name: "Page /ro?page=1&q=bmw",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- Report ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log("\n" + "─".repeat(60));
  console.log("SMOKE REPORT (RO listings cache)");
  console.log("BASE_URL:", BASE_URL);
  console.log("─".repeat(60));
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    const detail = r.detail ? ` – ${r.detail}` : "";
    const timings = r.timings ? ` | ${JSON.stringify(r.timings)}` : "";
    console.log(`  [${status}] ${r.name}${detail}${timings}`);
  }
  console.log("─".repeat(60));
  console.log(`Total: ${passed}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("Failed:", failed.map((r) => r.name).join(", "));
    process.exit(1);
  }
  console.log("All smoke tests passed.\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
