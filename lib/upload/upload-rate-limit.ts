import { RateLimitError, rateLimitOrThrow } from "@/lib/security/rateLimit";

/**
 * ~40 încărcări reale (proxy) / minut / utilizator — suficient pentru liste cu multe poze într-un singur submit.
 * Presign-ul nu mai consumă același contor (evită 2× pe imagine).
 * Upstash Redis când e configurat; altfel fallback în memorie.
 */
export async function enforceUploadRateLimit(userId: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url, token });
      const key = `upload:r2:${userId}`;
      const n = await redis.incr(key);
      if (n === 1) {
        await redis.expire(key, 60);
      }
      if (n > 40) {
        throw new RateLimitError("Prea multe încărcări. Încearcă din nou într-un minut.");
      }
      return;
    } catch (e) {
      if (e instanceof RateLimitError) throw e;
      console.warn("[upload-rate-limit] Upstash indisponibil, fallback în memorie:", e);
    }
  }

  await rateLimitOrThrow({
    key: `upload:r2:${userId}`,
    limit: 40,
    windowSeconds: 60,
  });
}
