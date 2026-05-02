import { describe, expect, it } from "vitest";
import { autocorrectRoSearchQ, normalizeListingsSearchQText } from "./qSearchAutocorrect";

describe("autocorrectRoSearchQ", () => {
  it("usastanga → usa stanga", () => {
    expect(autocorrectRoSearchQ("usastanga")).toBe("usa stanga");
  });

  it("păstrează tokeni deja separați", () => {
    expect(autocorrectRoSearchQ("usa stanga")).toBe("usa stanga");
  });

  it("planetarastanga → planetara stanga (greedy lexicon)", () => {
    expect(autocorrectRoSearchQ("planetarastanga")).toBe("planetara stanga");
  });
});

describe("normalizeListingsSearchQText", () => {
  it("elimină diacritice și aplică lipiri", () => {
    expect(normalizeListingsSearchQText("Usă stânga", 100)).toBe("usa stanga");
  });
});
