import { describe, expect, it } from "vitest";
import {
  buildRelaxedSuggestionList,
  dedupeListingsByIdentity,
  getExplicitDisplayState,
  sortListingsByGeoDistance,
} from "./clientListingFilters";

describe("clientListingFilters", () => {
  it("dedupes relaxed suggestions against exact items", () => {
    const exact = [{ id: "1", title: "Exact" }];
    const relaxed = [{ id: "1", title: "Duplicate" }, { id: "2", title: "Suggestion" }];

    expect(buildRelaxedSuggestionList(exact, relaxed, 10)).toEqual([{ id: "2", title: "Suggestion" }]);
  });

  it("tracks explicit display states", () => {
    expect(getExplicitDisplayState({
      mounted: false,
      exactCount: 0,
      relaxedCount: 0,
      loadingExact: false,
      loadingRelaxed: false,
    })).toBe("initial");

    expect(getExplicitDisplayState({
      mounted: true,
      exactCount: 0,
      relaxedCount: 3,
      loadingExact: false,
      loadingRelaxed: false,
    })).toBe("showingRelaxed");
  });

  it("sorts listings by distance when coordinates are available", () => {
    const items = [
      { id: "far", coordinates: { lat: 44.4, lng: 24.1 } },
      { id: "near", coordinates: { lat: 44.318, lng: 23.8 } },
    ];

    expect(sortListingsByGeoDistance(items, { lat: 44.318, lng: 23.8 }).map((item) => item.id)).toEqual(["near", "far"]);
  });

  it("keeps stable order while removing duplicate identities", () => {
    expect(dedupeListingsByIdentity([{ id: "1" }, { id: "1" }, { id: "2" }])).toEqual([{ id: "1" }, { id: "2" }]);
  });
});
