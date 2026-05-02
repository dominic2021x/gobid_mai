/**
 * Single source for access context used by listings and count APIs.
 * Token-gating for channel "executari_insolventa": one place to validate, reused by list + count.
 */

export type AccessContext = {
  hasExecutariAccess: boolean;
  tokenId?: string;
  scope?: string;
};

const COOKIE_NAME = "executari_access";
const HEADER_NAME = "x-executari-access";

/**
 * Resolve access from request. Reads token from cookie (preferred) or header.
 * Validates against EXECUTARI_ACCESS_SECRET (or comma-separated list of valid tokens).
 * DO NOT duplicate token validation in multiple routes — use this helper only.
 */
export async function resolveAccess(req: Request): Promise<AccessContext> {
  const secret = process.env.EXECUTARI_ACCESS_SECRET;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const headerToken = req.headers.get(HEADER_NAME)?.trim();

  let token: string | null = null;

  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`, "i"));
    if (match?.[1]) token = decodeURIComponent(match[1].trim());
  }
  if (!token && headerToken) token = headerToken;

  if (!token) {
    return { hasExecutariAccess: false };
  }

  if (!secret) {
    return { hasExecutariAccess: false };
  }

  const validTokens = secret.split(",").map((s) => s.trim()).filter(Boolean);
  const isValid = validTokens.length > 0 && validTokens.some((t) => token === t);
  if (!isValid) {
    return { hasExecutariAccess: false };
  }

  return {
    hasExecutariAccess: true,
    tokenId: token.slice(0, 8),
    scope: undefined,
  };
}
