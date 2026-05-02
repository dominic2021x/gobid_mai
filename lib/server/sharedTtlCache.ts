import { getSharedRedis } from "@/lib/server/sharedRedis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheStore = Map<string, CacheEntry<unknown>>;
type InflightStore = Map<string, Promise<unknown>>;

const localCacheStores = new Map<string, CacheStore>();
const inflightStores = new Map<string, InflightStore>();

function getLocalCacheStore(namespace: string): CacheStore {
  const existing = localCacheStores.get(namespace);
  if (existing) return existing;
  const created: CacheStore = new Map();
  localCacheStores.set(namespace, created);
  return created;
}

function getInflightStore(namespace: string): InflightStore {
  const existing = inflightStores.get(namespace);
  if (existing) return existing;
  const created: InflightStore = new Map();
  inflightStores.set(namespace, created);
  return created;
}

function readFromLocalCache<T>(namespace: string, key: string): T | null {
  const entry = getLocalCacheStore(namespace).get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    getLocalCacheStore(namespace).delete(key);
    return null;
  }
  return entry.value;
}

function writeToLocalCache<T>(namespace: string, key: string, value: T, ttlMs: number): T {
  getLocalCacheStore(namespace).set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

function buildCacheKey(namespace: string, key: string): string {
  return `shared-cache:${namespace}:${key}`;
}

function buildLockKey(namespace: string, key: string): string {
  return `shared-cache-lock:${namespace}:${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readFromSharedTtlCache<T>(namespace: string, key: string): Promise<T | null> {
  const local = readFromLocalCache<T>(namespace, key);
  if (local !== null) return local;

  const redis = await getSharedRedis();
  if (!redis) return null;

  const raw = await redis.get<string>(buildCacheKey(namespace, key));
  if (!raw) return null;

  const value = JSON.parse(raw) as T;
  writeToLocalCache(namespace, key, value, 2_000);
  return value;
}

export async function writeToSharedTtlCache<T>(
  namespace: string,
  key: string,
  value: T,
  ttlMs: number,
): Promise<T> {
  writeToLocalCache(namespace, key, value, Math.min(ttlMs, 2_000));

  const redis = await getSharedRedis();
  if (redis) {
    await redis.set(buildCacheKey(namespace, key), JSON.stringify(value), {
      ex: Math.max(1, Math.ceil(ttlMs / 1000)),
    });
  }

  return value;
}

export async function deleteSharedTtlCache(namespace: string, key: string): Promise<void> {
  getLocalCacheStore(namespace).delete(key);

  const redis = await getSharedRedis();
  if (redis) {
    await redis.del(buildCacheKey(namespace, key));
  }
}

export async function getOrLoadFromSharedTtlCache<T>(
  namespace: string,
  key: string,
  {
    ttlMs,
    loader,
    waitForSharedMs = 2_500,
    pollIntervalMs = 125,
    lockMs = 10_000,
  }: {
    ttlMs: number;
    loader: () => Promise<T>;
    waitForSharedMs?: number;
    pollIntervalMs?: number;
    lockMs?: number;
  },
): Promise<{ value: T; source: "local-cache" | "shared-cache" | "shared-wait" | "loader" | "local-inflight" }> {
  const local = readFromLocalCache<T>(namespace, key);
  if (local !== null) {
    return { value: local, source: "local-cache" };
  }

  const inflight = getInflightStore(namespace);
  const sharedInflight = inflight.get(key) as Promise<T> | undefined;
  if (sharedInflight) {
    return { value: await sharedInflight, source: "local-inflight" };
  }

  const redis = await getSharedRedis();
  if (!redis) {
    const pending = (async () => {
      const value = await loader();
      writeToLocalCache(namespace, key, value, ttlMs);
      return value;
    })();
    inflight.set(key, pending);
    try {
      return { value: await pending, source: "loader" };
    } finally {
      inflight.delete(key);
    }
  }

  const cacheKey = buildCacheKey(namespace, key);
  const lockKey = buildLockKey(namespace, key);
  const cached = await redis.get<string>(cacheKey);
  if (cached) {
    const value = JSON.parse(cached) as T;
    writeToLocalCache(namespace, key, value, 2_000);
    return { value, source: "shared-cache" };
  }

  const pending = (async () => {
    const lockOwner = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    let lockAcquired = false;
    const lockResult = await redis.set(lockKey, lockOwner, {
      nx: true,
      ex: Math.max(1, Math.ceil(lockMs / 1000)),
    });
    lockAcquired = lockResult === "OK";

    if (!lockAcquired) {
      const deadline = Date.now() + waitForSharedMs;
      while (Date.now() < deadline) {
        const sharedValue = await redis.get<string>(cacheKey);
        if (sharedValue) {
          const parsed = JSON.parse(sharedValue) as T;
          writeToLocalCache(namespace, key, parsed, 2_000);
          return { value: parsed, source: "shared-wait" as const };
        }
        await sleep(pollIntervalMs);
      }
    }

    try {
      const value = await loader();
      await writeToSharedTtlCache(namespace, key, value, ttlMs);
      return { value, source: "loader" as const };
    } finally {
      if (lockAcquired) {
        await redis.del(lockKey);
      }
    }
  })();

  inflight.set(key, pending.then((result) => result.value));
  try {
    return await pending;
  } finally {
    inflight.delete(key);
  }
}
