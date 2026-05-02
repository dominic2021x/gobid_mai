/**
 * In-memory rate limit for suggest endpoints (per-instance on Vercel serverless).
 * For production at scale, replace with Upstash Redis or Vercel KV.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 120; // per IP per minute

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  const xri = request.headers.get("x-real-ip");
  return xri ?? "unknown";
}

export function checkSuggestRateLimit(request: Request): { allowed: boolean; ip: string } {
  const ip = getClientIp(request);
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, ip };
  }

  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
    return { allowed: true, ip };
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, ip };
  }
  return { allowed: true, ip };
}
