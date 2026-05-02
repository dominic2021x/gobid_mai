import { describe, expect, it } from "vitest";
import { qToDistinctSearchTokens, RO_LISTINGS_Q_MAX_SEARCH_TOKENS } from "./qSearchTokens";

describe("qToDistinctSearchTokens", () => {
  it("dedupează tokeni identici (case / repetări)", () => {
    expect(qToDistinctSearchTokens("BMW BMW BMW x5")).toEqual(["BMW", "x5"]);
  });

  it("respectă plafonul", () => {
    const many = Array.from({ length: RO_LISTINGS_Q_MAX_SEARCH_TOKENS + 5 }, (_, i) => `w${i}`).join(" ");
    expect(qToDistinctSearchTokens(many).length).toBe(RO_LISTINGS_Q_MAX_SEARCH_TOKENS);
  });

  it("string gol → []", () => {
    expect(qToDistinctSearchTokens("   ")).toEqual([]);
  });

  it("autocorectează lipituri comune piese (usastanga)", () => {
    expect(qToDistinctSearchTokens("usastanga")).toEqual(["usa", "stanga"]);
  });
});
