/**
 * IP-based rate limiting for Route Handlers (Vercel serverless).
 *
 * LIMITATIONS (Vercel serverless):
 * - In-memory store: each function instance has its own memory; cold starts reset counters.
 * - Best-effort: under high concurrency, different instances may allow more requests than the limit.
 * - Not shared across regions or deployments.
 *
 * For production at scale, use: Redis (Upstash), Supabase table with window counts, or Vercel KV.
 *
 * @see https://vercel.com/docs/functions/serverless-functions#execution-model
 */

export class RateLimitError extends Error {
  constructor(message: string = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export function getClientIp(req: Request | { headers: Headers }): string {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

const store = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 5;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if the request is allowed (not rate-limited).
 * Call this at the start of your route handler.
 *
 * @param ip - Client IP (from x-forwarded-for or x-real-ip)
 * @param options - maxRequests per window, windowMs
 */
export function checkRateLimit(
  ip: string,
  options?: { maxRequests?: number; windowMs?: number }
): RateLimitResult {
  return checkRateLimitByKey(`rl:${ip}`, options);
}

function checkRateLimitByKey(
  key: string,
  options?: { maxRequests?: number; windowMs?: number }
): RateLimitResult {
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  const storeKey = key.startsWith("rl:") ? key : `rl:${key}`;
  let entry = store.get(storeKey);

  if (!entry) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(storeKey, entry);
    return { allowed: true, remaining: maxRequests - 1, resetAt: entry.resetAt };
  }

  if (now >= entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    store.set(storeKey, entry);
    return { allowed: true, remaining: maxRequests - 1, resetAt: entry.resetAt };
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;

  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/** Prune old entries periodically to avoid unbounded memory growth. */
export function pruneStore(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

/** Async rate limit check - throws RateLimitError if not allowed. For assistant/chat routes. */
export async function rateLimitOrThrow(
  options: { key: string; limit: number; windowSeconds: number } | { ip: string; maxRequests?: number; windowMs?: number; windowSec?: number; dailyQuota?: number }
): Promise<void> {
  let key: string;
  let maxRequests: number;
  let windowMs: number;
  if ("key" in options && "limit" in options && "windowSeconds" in options) {
    key = options.key;
    maxRequests = options.limit;
    windowMs = options.windowSeconds * 1000;
  } else if ("ip" in options) {
    key = `rl:${options.ip}`;
    maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    windowMs = options.windowSec != null ? options.windowSec * 1000 : (options.windowMs ?? DEFAULT_WINDOW_MS);
  } else {
    throw new Error("Invalid rateLimitOrThrow options");
  }
  const result = checkRateLimitByKey(key, { maxRequests, windowMs });
  pruneStore();
  if (!result.allowed) {
    throw new RateLimitError(`Prea multe cereri. Încercați după ${Math.ceil((result.resetAt - Date.now()) / 1000)} secunde.`);
  }
}
