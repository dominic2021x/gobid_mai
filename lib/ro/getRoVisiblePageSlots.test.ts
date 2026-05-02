import { describe, expect, it } from "vitest";
import { getRoVisiblePageSlots } from "./getRoVisiblePageSlots";

describe("getRoVisiblePageSlots", () => {
  it("returns single page", () => {
    expect(getRoVisiblePageSlots(1, 1, 2)).toEqual([1]);
  });

  it("shows compact middle window with ellipses for large totals", () => {
    expect(getRoVisiblePageSlots(34, 5, 2)).toEqual([1, "...", 3, 4, 5, 6, 7, "...", 34]);
    expect(getRoVisiblePageSlots(11, 5, 2)).toEqual([1, "...", 3, 4, 5, 6, 7, "...", 11]);
  });

  it("near start shows up to seven leading inner pages before ellipsis", () => {
    expect(getRoVisiblePageSlots(11, 2, 2)).toEqual([1, 2, 3, 4, 5, 6, 7, "...", 11]);
    expect(getRoVisiblePageSlots(34, 1, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, "...", 34]);
  });

  it("near end avoids redundant trailing ellipsis", () => {
    expect(getRoVisiblePageSlots(11, 10, 2)).toEqual([1, "...", 8, 9, 10, 11]);
  });

  it("delta=3 widens window (~7 inner pages when far from edges)", () => {
    expect(getRoVisiblePageSlots(34, 5, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, "...", 34]);
    expect(getRoVisiblePageSlots(34, 17, 3)).toEqual([1, "...", 14, 15, 16, 17, 18, 19, 20, "...", 34]);
  });

  it("caps absurd delta at 5", () => {
    expect(getRoVisiblePageSlots(100, 50, 999)).toEqual(getRoVisiblePageSlots(100, 50, 5));
  });

  it("maxLeadingSpan=3 + mic delta — puține pastile la început (mobil)", () => {
    expect(getRoVisiblePageSlots(11, 2, 1, { maxLeadingSpan: 3 })).toEqual([1, 2, 3, "...", 11]);
    expect(getRoVisiblePageSlots(34, 1, 1, { maxLeadingSpan: 3 })).toEqual([1, 2, 3, "...", 34]);
  });
});
