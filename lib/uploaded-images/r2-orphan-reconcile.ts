/**
 * Opțional: compară obiecte R2 sub `uploads/` cu `uploaded_images.storage_key` (eșantion).
 * Read-only — nu șterge; pentru observabilitate / audit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { UPLOADED_IMAGES_CLEANUP_MAX_MS } from "./cleanup-constants";
import { getR2EnvConfig, listObjectKeysPage } from "@/lib/upload/r2-server";

export type R2OrphanReconcileResult = {
  scannedObjectKeys: number;
  /** Eșantion aleatoriu de max. 100 chei orfane din run. */
  orphanKeysInR2NotInDb: string[];
  orphanCount: number;
  truncated: boolean;
  stoppedEarly: boolean;
  error?: string;
};

const DEFAULT_MAX_SCAN = 20_000;
const ORPHAN_SAMPLE_CAP = 100;
/** Max pagini ListObjects per run (în plus față de plafon 20k chei). */
const MAX_PAGES_PER_RUN = 50;
/** PostgREST respinge des `.in()` cu sute de valori lungi → „Bad Request”. */
const STORAGE_KEY_IN_CHUNK = 100;

async function storageKeysFoundInDb(db: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += STORAGE_KEY_IN_CHUNK) {
    const chunk = keys.slice(i, i + STORAGE_KEY_IN_CHUNK);
    const { data: rows, error } = await db.from("uploaded_images").select("storage_key").in("storage_key", chunk);
    if (error) {
      throw new Error(error.message);
    }
    for (const r of rows ?? []) {
      if (r && typeof r === "object" && "storage_key" in r && typeof (r as { storage_key: string }).storage_key === "string") {
        found.add((r as { storage_key: string }).storage_key);
      }
    }
  }
  return found;
}

function randomSampleStrings(items: string[], k: number): string[] {
  if (items.length <= k) return [...items];
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, k);
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

/**
 * Listează pagini din R2 (`uploads/`) și verifică existența în DB (batch `in`).
 * Max ~20k chei per run; până la 100 chei orfane returnate ca eșantion aleatoriu.
 * Guard runtime: aceeași fereastră ca cleanup (UPLOADED_IMAGES_CLEANUP_MAX_MS, 100s).
 */
export async function runR2OrphanSampleReconcile(
  db: SupabaseClient,
  options?: { maxScan?: number; startedAtMs?: number }
): Promise<R2OrphanReconcileResult> {
  const tickStart = options?.startedAtMs ?? Date.now();
  const cfg = getR2EnvConfig();
  if (!cfg) {
    return {
      scannedObjectKeys: 0,
      orphanKeysInR2NotInDb: [],
      orphanCount: 0,
      truncated: false,
      stoppedEarly: false,
      error: "R2 neconfigurat",
    };
  }

  const maxScan = options?.maxScan ?? DEFAULT_MAX_SCAN;
  const orphans: string[] = [];
  let scanned = 0;
  let truncated = false;
  let token: string | undefined;
  let stoppedEarly = false;
  const reconcileMaxMs = UPLOADED_IMAGES_CLEANUP_MAX_MS;

  try {
    let pageIterations = 0;
    while (scanned < maxScan && pageIterations < MAX_PAGES_PER_RUN) {
      if (elapsed(tickStart) >= reconcileMaxMs) {
        stoppedEarly = true;
        break;
      }

      pageIterations++;
      const remaining = maxScan - scanned;
      const pageMax = Math.min(500, remaining);
      const page = await listObjectKeysPage(cfg, {
        prefix: "uploads/",
        maxKeys: pageMax,
        continuationToken: token,
      });

      const keys = page.keys.filter(
        (k) => k.startsWith("uploads/") && !k.endsWith("/") && !k.includes("..")
      );
      if (keys.length === 0) {
        token = page.nextContinuationToken;
        if (!token) break;
        continue;
      }

      let inDb: Set<string>;
      try {
        inDb = await storageKeysFoundInDb(db, keys);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          scannedObjectKeys: scanned,
          orphanKeysInR2NotInDb: randomSampleStrings(orphans, ORPHAN_SAMPLE_CAP),
          orphanCount: orphans.length,
          truncated,
          stoppedEarly,
          error: msg,
        };
      }
      for (const k of keys) {
        if (!inDb.has(k)) {
          orphans.push(k);
        }
      }

      scanned += keys.length;
      token = page.nextContinuationToken;
      if (!token) break;
    }

    if ((scanned >= maxScan && token) || pageIterations >= MAX_PAGES_PER_RUN) {
      truncated = true;
    }

    return {
      scannedObjectKeys: scanned,
      orphanKeysInR2NotInDb: randomSampleStrings(orphans, ORPHAN_SAMPLE_CAP),
      orphanCount: orphans.length,
      truncated,
      stoppedEarly,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      scannedObjectKeys: scanned,
      orphanKeysInR2NotInDb: randomSampleStrings(orphans, ORPHAN_SAMPLE_CAP),
      orphanCount: orphans.length,
      truncated,
      stoppedEarly,
      error: msg,
    };
  }
}
