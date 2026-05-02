import { describe, expect, it } from "vitest";
import { normalizeRoListingsSearchParams } from "./normalizedListingsQuery";
import { RO_LISTINGS_PAGE_SIZE_DESKTOP } from "./roListingsPagination";

describe("normalizeRoListingsSearchParams", () => {
  it("uses the same default first page contract for SSR and API", () => {
    const normalized = normalizeRoListingsSearchParams(new URLSearchParams("category=autovehicule"));

    expect(normalized.query.from).toBe(0);
    expect(normalized.query.page).toBe(1);
    expect(normalized.query.limit).toBe(RO_LISTINGS_PAGE_SIZE_DESKTOP);
    expect(normalized.query.pageSize).toBe(RO_LISTINGS_PAGE_SIZE_DESKTOP);
  });

  it("normalizes q and removes q when it duplicates category intent", () => {
    const normalized = normalizeRoListingsSearchParams(
      new URLSearchParams("q=Piese%20Auto&category=autovehicule&subcategory=piese-auto"),
    );

    expect(normalized.query.q).toBeUndefined();
    expect(normalized.query.subcategorie).toBe("piese-auto");
  });

  it("keeps radius only when a valid geo center exists", () => {
    const withoutCenter = normalizeRoListingsSearchParams(new URLSearchParams("location=Craiova&radiusKm=50"));
    const withCenter = normalizeRoListingsSearchParams(
      new URLSearchParams("location=Craiova&radiusKm=50&nearLat=44.318&nearLng=23.8"),
    );

    expect(withoutCenter.query.radius_km).toBeUndefined();
    expect(withCenter.query.radius_km).toBe(50);
  });

  it("uses canonical limit and ignores pageSize URL noise", () => {
    const normalized = normalizeRoListingsSearchParams(new URLSearchParams("limit=24&pageSize=5&page=2"));
    expect(normalized.query.limit).toBe(24);
    expect(normalized.query.pageSize).toBe(24);
    expect(normalized.searchParams.get("pageSize")).toBeNull();
  });

  it("autocorectează q lipit (ex. usastanga → usa stanga)", () => {
    const normalized = normalizeRoListingsSearchParams(new URLSearchParams("q=usastanga"));
    expect(normalized.query.q).toBe("usa stanga");
  });
});
