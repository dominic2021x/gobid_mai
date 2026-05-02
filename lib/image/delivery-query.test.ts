/**
 * Run: npx vitest run lib/image/delivery-query.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildCanonicalDeliverUrl, isDeliverUrlCanonical } from "./delivery-query";

describe("buildCanonicalDeliverUrl", () => {
  it("orders query keys as dpr, exp, ext, hash, sig, w", () => {
    const u = new URL(
      "https://img.example.com/api/image/deliver?hash=aa&w=600&sig=bb&exp=123&ext=webp&dpr=2"
    );
    const c = buildCanonicalDeliverUrl(u);
    expect(c.searchParams.get("dpr")).toBe("2");
    expect(c.search).toMatch(/^\?dpr=2&exp=123&ext=webp&hash=aa&sig=bb&w=600$/);
  });

  it("preserves pathname for Worker routes", () => {
    const u = new URL("https://cdn.example.com/deliver?w=300&hash=bb&sig=cc&exp=1&ext=avif&dpr=1");
    const c = buildCanonicalDeliverUrl(u);
    expect(c.pathname).toBe("/deliver");
    expect(c.search).toMatch(/^\?dpr=1/);
  });
});

describe("isDeliverUrlCanonical", () => {
  it("is true only when search matches canonical ordering", () => {
    const h64 = "a".repeat(64);
    const good = new URL(
      `https://x.com/api/image/deliver?dpr=1&exp=9&ext=jpeg&hash=${h64}&sig=s&w=300`
    );
    expect(isDeliverUrlCanonical(good)).toBe(true);

    const wrongOrder = new URL(
      `https://x.com/api/image/deliver?w=300&dpr=1&exp=9&ext=jpeg&hash=${h64}&sig=s`
    );
    expect(isDeliverUrlCanonical(wrongOrder)).toBe(false);
  });
});
