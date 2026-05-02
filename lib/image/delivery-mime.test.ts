/**
 * Run: npx vitest run lib/image/delivery-mime.test.ts
 */

import { describe, it, expect } from "vitest";
import { resolveStrictDeliveryContentType } from "./delivery-mime";

describe("resolveStrictDeliveryContentType", () => {
  it("returns deterministic MIME for transform mode", () => {
    const r = resolveStrictDeliveryContentType("image/jpeg", {
      kind: "transform",
      format: "avif",
    });
    expect(r.contentType).toBe("image/avif");
    expect(r.upstreamMismatch).toBe(true);
  });

  it("marks match when upstream agrees", () => {
    const r = resolveStrictDeliveryContentType("image/avif; charset=binary", {
      kind: "transform",
      format: "avif",
    });
    expect(r.contentType).toBe("image/avif");
    expect(r.upstreamMismatch).toBe(false);
  });

  it("uses storage ext for R2 fallback", () => {
    const r = resolveStrictDeliveryContentType("application/octet-stream", {
      kind: "r2",
      storageExt: "webp",
    });
    expect(r.contentType).toBe("image/webp");
    expect(r.upstreamMismatch).toBe(true);
  });
});
