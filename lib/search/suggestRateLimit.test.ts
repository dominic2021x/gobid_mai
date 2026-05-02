/**
 * Unit tests for suggest rate limit (in-memory).
 * Run: npx vitest run lib/search/suggestRateLimit.test.ts
 */

import { describe, it, expect } from "vitest";
import { checkSuggestRateLimit } from "./suggestRateLimit";

function mockRequest(ip: string): Request {
  return {
    headers: {
      get(name: string) {
        return name === "x-forwarded-for" ? ip : name === "x-real-ip" ? null : null;
      },
    },
  } as unknown as Request;
}

describe("checkSuggestRateLimit", () => {
  it("allows first request", () => {
    const req = mockRequest("1.2.3.4");
    const { allowed } = checkSuggestRateLimit(req);
    expect(allowed).toBe(true);
  });

  it("returns same ip from x-forwarded-for", () => {
    const req = mockRequest("10.0.0.1");
    const { allowed, ip } = checkSuggestRateLimit(req);
    expect(allowed).toBe(true);
    expect(ip).toBe("10.0.0.1");
  });
});
