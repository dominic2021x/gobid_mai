import { describe, expect, it } from "vitest";
import { normalizeRoQuery } from "./roNormalize";

describe("normalizeRoQuery", () => {
  it("normalizes Romanian diacritics", () => {
    const out = normalizeRoQuery("Căutare în București, Târgu-Mureș");
    expect(out.normalized).toBe("cautare in bucuresti targu-mures");
    expect(out.tokens).toEqual(["cautare", "in", "bucuresti", "targu-mures"]);
  });

  it("normalizes plural tokens to singular", () => {
    const out = normalizeRoQuery("apartamente masini terenuri");
    expect(out.normalized).toBe("apartament masina teren");
    expect(out.tokens).toEqual(["apartament", "masina", "teren"]);
  });

  it("handles mixed real-estate query", () => {
    const out = normalizeRoQuery("apartamente 2 camere bucuresti");
    expect(out.normalized).toBe("apartament 2 camera bucuresti");
    expect(out.tokens).toEqual(["apartament", "2", "camera", "bucuresti"]);
  });
});
