import { describe, expect, it } from "vitest";
import { analyzeSearchForRo } from "./search-query-analyzer";

describe("analyzeSearchForRo", () => {
  it("interpretează 'turbo bmw' ca piesă auto Turbo, nu ca model autoturism", () => {
    const analysis = analyzeSearchForRo("turbo bmw");

    expect(analysis.categoryKey).toBe("autovehicule");
    expect(analysis.subcategoryKey).toBe("piese-auto");
    expect(analysis.brand).toBe("BMW");
    expect(analysis.level3).toBe("turbo");
    expect(analysis.modelQuery).toBe("");
  });
});
