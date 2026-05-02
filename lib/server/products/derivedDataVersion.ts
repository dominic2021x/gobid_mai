import { getSharedRedis } from "@/lib/server/sharedRedis";

const PRODUCTS_DERIVED_DATA_VERSION_KEY = "products-derived-data:version";

let fallbackVersion = Date.now().toString();
let cachedVersion: { value: string; expiresAt: number } | null = null;

export async function getProductsDerivedDataVersion(): Promise<string> {
  if (cachedVersion && cachedVersion.expiresAt > Date.now()) {
    return cachedVersion.value;
  }

  const redis = await getSharedRedis();
  if (redis) {
    const value = await redis.get<string>(PRODUCTS_DERIVED_DATA_VERSION_KEY);
    if (value) {
      cachedVersion = { value, expiresAt: Date.now() + 5_000 };
      return value;
    }
  }

  cachedVersion = { value: fallbackVersion, expiresAt: Date.now() + 5_000 };
  return fallbackVersion;
}

export async function bumpProductsDerivedDataVersion(reason?: string): Promise<string> {
  const nextValue = `${Date.now()}`;
  fallbackVersion = nextValue;
  cachedVersion = { value: nextValue, expiresAt: Date.now() + 5_000 };

  const redis = await getSharedRedis();
  if (redis) {
    await redis.set(PRODUCTS_DERIVED_DATA_VERSION_KEY, nextValue);
    if (reason) {
      await redis.set(`${PRODUCTS_DERIVED_DATA_VERSION_KEY}:reason`, reason, { ex: 3600 });
    }
  }

  return nextValue;
}
