import { RateLimitError } from "@/lib/security/rateLimit";
import { checkRateLimit, pruneStore } from "@/lib/security/rateLimit";

/**
 * Fallback when Upstash is not configured (per-isolate; not global).
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 180;

function enforceImageDeliveryRateLimitInMemory(ip: string): void {
  const result = checkRateLimit(`deliver:${ip}`, {
    maxRequests: MAX_PER_WINDOW,
    windowMs: WINDOW_MS,
  });
  pruneStore();
  if (!result.allowed) {
    throw new RateLimitError(
      `Prea multe cereri de imagini. Reîncearcă în ${Math.ceil((result.resetAt - Date.now()) / 1000)}s.`
    );
  }
}

/**
 * Distributed rate limit (Upstash Redis) when `UPSTASH_REDIS_REST_*` is set — same stack as upload limits.
 * Window: 60s, max **180** GETs / IP / window (tune for prod).
 */
export async function enforceImageDeliveryRateLimit(ip: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });
    const key = `img:deliver:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) {
      await redis.expire(key, 60);
    }
    if (n > MAX_PER_WINDOW) {
      throw new RateLimitError("Prea multe cereri de imagini. Încearcă din nou într-un minut.");
    }
    return;
  }

  enforceImageDeliveryRateLimitInMemory(ip);
}
