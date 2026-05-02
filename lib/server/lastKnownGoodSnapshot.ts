import { POSTGREST_TIMEOUT_CODE } from "@/lib/server/supabase/postgrest";

type SnapshotRecord<T> = {
  value: T;
  storedAt: number;
};

type FreshSnapshot<T> = SnapshotRecord<T> & {
  ageMs: number;
};

const NON_FALLBACK_CODES = new Set([
  "PGRST100",
  "PGRST102",
  "PGRST116",
  "PGRST301",
  "42501",
  "42P01",
  "42703",
  "42601",
]);

const FALLBACK_CODES = new Set([
  "PGRST002",
  POSTGREST_TIMEOUT_CODE,
]);

const snapshotStores = new Map<string, Map<string, SnapshotRecord<unknown>>>();

function getStore(namespace: string): Map<string, SnapshotRecord<unknown>> {
  const existing = snapshotStores.get(namespace);
  if (existing) return existing;
  const created = new Map<string, SnapshotRecord<unknown>>();
  snapshotStores.set(namespace, created);
  return created;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return '"__undefined__"';
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function buildLastKnownGoodSnapshotKey(parts: Record<string, unknown>): string {
  return stableSerialize(parts);
}

export function rememberLastKnownGoodSnapshot<T>(namespace: string, key: string, value: T): void {
  getStore(namespace).set(key, {
    value,
    storedAt: Date.now(),
  });
}

export function readFreshLastKnownGoodSnapshot<T>(
  namespace: string,
  key: string,
  ttlMs: number,
): FreshSnapshot<T> | null {
  const store = getStore(namespace);
  const record = store.get(key) as SnapshotRecord<T> | undefined;
  if (!record) return null;

  const ageMs = Date.now() - record.storedAt;
  if (ageMs > ttlMs) {
    store.delete(key);
    return null;
  }

  return {
    ...record,
    ageMs,
  };
}

function toErrorMeta(error: unknown): {
  code: string;
  status: number;
  haystack: string;
} {
  if (!error || typeof error !== "object") {
    return {
      code: "",
      status: 0,
      haystack: typeof error === "string" ? error.toLowerCase() : "",
    };
  }

  const e = error as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  const details = typeof e.details === "string" ? e.details : "";
  const hint = typeof e.hint === "string" ? e.hint : "";

  return {
    code,
    status,
    haystack: `${name} ${message} ${details} ${hint}`.toLowerCase(),
  };
}

export function shouldUseLastKnownGoodSnapshot(error: unknown): boolean {
  const { code, status, haystack } = toErrorMeta(error);

  if (NON_FALLBACK_CODES.has(code)) return false;
  if (status >= 400 && status < 500) return false;

  if (
    haystack.includes("unauthorized") ||
    haystack.includes("forbidden") ||
    haystack.includes("invalid login") ||
    haystack.includes("invalid token") ||
    haystack.includes("bad request") ||
    haystack.includes("jwt") ||
    haystack.includes("auth")
  ) {
    return false;
  }

  if (
    (haystack.includes("schema") && !haystack.includes("schema cache")) ||
    haystack.includes("relation ") ||
    haystack.includes("column ") ||
    haystack.includes("syntax error") ||
    haystack.includes("failed to parse") ||
    haystack.includes("parse error")
  ) {
    return false;
  }

  if (FALLBACK_CODES.has(code)) return true;
  if (status === 502 || status === 503 || status === 504) return true;

  return (
    haystack.includes("timeout") ||
    haystack.includes("aborterror") ||
    haystack.includes("connection not available") ||
    haystack.includes("too many database connections") ||
    haystack.includes("check out connection from the pool") ||
    haystack.includes("eccheckouttimeout") ||
    haystack.includes("upstream request timeout") ||
    haystack.includes("connection closed") ||
    haystack.includes(":closed") ||
    haystack.includes("fetch failed") ||
    haystack.includes("socket hang up") ||
    haystack.includes("econnreset") ||
    haystack.includes("etimedout")
  );
}
