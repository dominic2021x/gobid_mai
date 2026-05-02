import type { Redis } from "@upstash/redis";

let redisPromise: Promise<Redis | null> | null = null;

export function isSharedRedisConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

export async function getSharedRedis(): Promise<Redis | null> {
  if (redisPromise) return redisPromise;

  redisPromise = (async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;

    const { Redis } = await import("@upstash/redis");
    return new Redis({ url, token });
  })();

  return redisPromise;
}
