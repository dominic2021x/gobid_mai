/**
 * Unit tests for licitatii-insolventa scraper (parseListing, location).
 * Run: npx vitest run lib/scraper/parseListing.test.ts
 */

import { describe, it, expect } from "vitest";
import { extractExternalId, getLastPage } from "./parseListing";
import { normalizeLocation } from "./location";

describe("extractExternalId", () => {
  it("extracts id from URL suffix _i172250", () => {
    expect(extractExternalId("https://www.licitatii-insolventa.ro/anunt/titlu_i172250")).toBe("172250");
    expect(extractExternalId("https://example.com/page_i123?foo=1")).toBe("123");
    expect(extractExternalId("https://example.com/item_i999#section")).toBe("999");
  });

  it("extracts id from text fallback ID anunt #172250", () => {
    expect(extractExternalId("https://example.com/page", "ID anunt #172250")).toBe("172250");
    expect(extractExternalId("https://example.com/page", "ID anunt #123")).toBe("123");
  });

  it("returns last number group when no _i match", () => {
    expect(extractExternalId("https://example.com/anunt/123")).toBe("123");
  });

  it("returns empty string when no id found", () => {
    expect(extractExternalId("https://example.com/no-id")).toBe("");
  });
});

describe("normalizeLocation", () => {
  it('parses "Gura Ocnitei in Dambovita (Romania)" into city and county', () => {
    const r = normalizeLocation("Gura Ocnitei in Dambovita (Romania)");
    expect(r.raw).toBe("Gura Ocnitei in Dambovita");
    expect(r.city).toBe("Gura Ocnitei");
    expect(r.county).toBe("Dambovita");
  });

  it("removes (Romania) and trims", () => {
    const r = normalizeLocation("  Bucuresti  (Romania)  ");
    expect(r.raw).toBe("Bucuresti");
    expect(r.city).toBe("Bucuresti");
    expect(r.county).toBeNull();
  });

  it("handles multiple spaces", () => {
    const r = normalizeLocation("Gura   Ocnitei   in   Dambovita   (Romania)");
    expect(r.city).toBe("Gura Ocnitei");
    expect(r.county).toBe("Dambovita");
  });

  it("returns empty raw when input is empty", () => {
    const r = normalizeLocation("");
    expect(r.raw).toBe("");
    expect(r.city).toBeNull();
    expect(r.county).toBeNull();
  });
});

describe("getLastPage", () => {
  it("extracts last page from .paginate a.searchPaginationLast href with iPage,39 (query)", () => {
    const html = `
      <div class="paginate">
        <a href="/cauta?iPage,1">1</a>
        <a class="searchPaginationLast" href="/cauta?iPage,39">39</a>
      </div>
    `;
    expect(getLastPage(html)).toBe(39);
  });

  it("extracts last page from path format /cauta/iPage,40", () => {
    const html = `
      <div class="paginate">
        <ul>
          <li><span class="searchPaginationSelected">1</span></li>
          <li><a href="https://www.licitatii-insolventa.ro/cauta/iPage,2">2</a></li>
          <li><a href="https://www.licitatii-insolventa.ro/cauta/iPage,40" class="searchPaginationLast list-last"><i class="fa fa-angle-double-right"></i></a></li>
        </ul>
      </div>
    `;
    expect(getLastPage(html)).toBe(40);
  });

  it("returns 1 when no pagination last link", () => {
    expect(getLastPage("<div>No pagination</div>")).toBe(1);
  });

  it("returns 1 when link has no iPage", () => {
    const html = '<div class="paginate"><a class="searchPaginationLast" href="/cauta">Last</a></div>';
    expect(getLastPage(html)).toBe(1);
  });
});
