/**
 * Curățare R2 + uploaded_images: doar în cron (async), nu în calea request-urilor HTTP.
 *
 * Referințe „în uz”: doar `product_images` + job-uri mirror `pending`/`processing` (SQL).
 * După R2: `finalize_uploaded_image_purge` verifică din nou înainte de DELETE (race-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteObjectByKeyWithRetry, getR2EnvConfig } from "@/lib/upload/r2-server";

import {
  getEffectiveR2DeleteMaxPerTick,
  UPLOADED_IMAGES_CLEANUP_BATCH,
  UPLOADED_IMAGES_CLEANUP_MAX_MS,
} from "./cleanup-constants";
import { classifyR2DeleteError } from "./r2-error-classify";
import { computeLatencyAvgAndP95 } from "./latency-stats";
import { isAllowedPurgeStorageKey } from "./storage-key-guard";

export type UploadedImagesCleanupResult = {
  softMarked: number;
  purgeCandidates: number;
  purgedDbRows: number;
  r2DeleteSuccess: number;
  r2DeleteSkippedAfterRetries: number;
  r2DeleteFailedPermanent: number;
  dbDeleteSkippedStillReferenced: number;
  storageKeyRejected: number;
  stoppedEarly: boolean;
  r2DeleteCapReached: boolean;
  /** Rânduri rămase neprocesate fiindcă s-a atins plafonul R2 (estimate). */
  r2DeleteSkippedDueToCap: number;
  executionMs: number;
  purgeThroughputRowsPerMs: number | null;
  r2DeleteLatencyAvg: number | null;
  r2DeleteLatencyP95: number | null;
  r2DeleteErrorsByKind: { network: number; auth: number; other: number };
  rpcErrors: string[];
  r2Errors: string[];
};

function asPurgeRows(data: unknown): Array<{ id: string; storage_key: string }> {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is { id: string; storage_key: string } =>
      r !== null &&
      typeof r === "object" &&
      "id" in r &&
      "storage_key" in r &&
      typeof (r as { id: unknown }).id === "string" &&
      typeof (r as { storage_key: unknown }).storage_key === "string"
  );
}

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): number {
  return nowMs() - startedAt;
}

/** Evită /0 și NaN la throughput. */
function safePurgeThroughputRowsPerMs(purgedRows: number, phaseMs: number): number | null {
  if (!Number.isFinite(purgedRows) || !Number.isFinite(phaseMs) || phaseMs <= 0) {
    return null;
  }
  const v = purgedRows / phaseMs;
  return Number.isFinite(v) ? v : null;
}

function emptyMetrics(): Pick<
  UploadedImagesCleanupResult,
  | "r2DeleteLatencyAvg"
  | "r2DeleteLatencyP95"
  | "r2DeleteFailedPermanent"
  | "purgeThroughputRowsPerMs"
  | "r2DeleteErrorsByKind"
> {
  return {
    r2DeleteLatencyAvg: null,
    r2DeleteLatencyP95: null,
    r2DeleteFailedPermanent: 0,
    purgeThroughputRowsPerMs: null,
    r2DeleteErrorsByKind: { network: 0, auth: 0, other: 0 },
  };
}

function logCleanup(result: UploadedImagesCleanupResult): void {
  console.info(
    "[uploaded-images-cleanup]",
    JSON.stringify({
      at: new Date().toISOString(),
      executionMs: result.executionMs,
      stoppedEarly: result.stoppedEarly,
      r2DeleteCapReached: result.r2DeleteCapReached,
      r2DeleteSkippedDueToCap: result.r2DeleteSkippedDueToCap,
      purgeThroughputRowsPerMs: result.purgeThroughputRowsPerMs,
      softMarked: result.softMarked,
      purgeCandidates: result.purgeCandidates,
      purgedDbRows: result.purgedDbRows,
      r2DeleteSuccess: result.r2DeleteSuccess,
      r2DeleteSkippedAfterRetries: result.r2DeleteSkippedAfterRetries,
      r2DeleteFailedPermanent: result.r2DeleteFailedPermanent,
      dbDeleteSkippedStillReferenced: result.dbDeleteSkippedStillReferenced,
      storageKeyRejected: result.storageKeyRejected,
      r2DeleteLatencyAvg: result.r2DeleteLatencyAvg,
      r2DeleteLatencyP95: result.r2DeleteLatencyP95,
      r2DeleteErrorsByKind: result.r2DeleteErrorsByKind,
      rpcErrorCount: result.rpcErrors.length,
      r2ErrorCount: result.r2Errors.length,
    })
  );
}

export async function runUploadedImagesCleanupTick(
  db: SupabaseClient
): Promise<UploadedImagesCleanupResult> {
  const startedAt = nowMs();
  const rpcErrors: string[] = [];
  const r2Errors: string[] = [];
  const errKind = { network: 0, auth: 0, other: 0 };

  const finish = (
    partial: Omit<UploadedImagesCleanupResult, "executionMs" | "purgeThroughputRowsPerMs"> & {
      purgeThroughputRowsPerMs?: number | null;
    }
  ): UploadedImagesCleanupResult => {
    const executionMs = elapsedMs(startedAt);
    const result: UploadedImagesCleanupResult = {
      ...partial,
      executionMs,
      purgeThroughputRowsPerMs:
        partial.purgeThroughputRowsPerMs !== undefined ? partial.purgeThroughputRowsPerMs : null,
    };
    logCleanup(result);
    return result;
  };

  const metricsZero = emptyMetrics();

  if (elapsedMs(startedAt) >= UPLOADED_IMAGES_CLEANUP_MAX_MS) {
    return finish({
      softMarked: 0,
      purgeCandidates: 0,
      purgedDbRows: 0,
      r2DeleteSuccess: 0,
      r2DeleteSkippedAfterRetries: 0,
      dbDeleteSkippedStillReferenced: 0,
      storageKeyRejected: 0,
      stoppedEarly: true,
      r2DeleteCapReached: false,
      r2DeleteSkippedDueToCap: 0,
      ...metricsZero,
      rpcErrors: ["timeout: skip tick (guard înainte de RPC)"],
      r2Errors: [],
    });
  }

  const { data: softData, error: softErr } = await db.rpc("mark_orphan_uploaded_images_soft_delete", {
    p_limit: UPLOADED_IMAGES_CLEANUP_BATCH,
  });
  if (softErr) {
    rpcErrors.push(`mark_orphan_uploaded_images_soft_delete: ${softErr.message}`);
  }

  const softMarked = typeof softData === "number" ? softData : Number(softData) || 0;

  if (elapsedMs(startedAt) >= UPLOADED_IMAGES_CLEANUP_MAX_MS) {
    return finish({
      softMarked,
      purgeCandidates: 0,
      purgedDbRows: 0,
      r2DeleteSuccess: 0,
      r2DeleteSkippedAfterRetries: 0,
      dbDeleteSkippedStillReferenced: 0,
      storageKeyRejected: 0,
      stoppedEarly: true,
      r2DeleteCapReached: false,
      r2DeleteSkippedDueToCap: 0,
      ...metricsZero,
      rpcErrors,
      r2Errors: [],
    });
  }

  const cfg = getR2EnvConfig();
  if (!cfg) {
    return finish({
      softMarked,
      purgeCandidates: 0,
      purgedDbRows: 0,
      r2DeleteSuccess: 0,
      r2DeleteSkippedAfterRetries: 0,
      dbDeleteSkippedStillReferenced: 0,
      storageKeyRejected: 0,
      stoppedEarly: false,
      r2DeleteCapReached: false,
      r2DeleteSkippedDueToCap: 0,
      ...metricsZero,
      rpcErrors,
      r2Errors: ["R2 neconfigurat — skip purge."],
    });
  }

  const { data: purgeData, error: purgeErr } = await db.rpc("claim_uploaded_images_for_purge", {
    p_limit: UPLOADED_IMAGES_CLEANUP_BATCH,
  });
  if (purgeErr) {
    rpcErrors.push(`claim_uploaded_images_for_purge: ${purgeErr.message}`);
    return finish({
      softMarked,
      purgeCandidates: 0,
      purgedDbRows: 0,
      r2DeleteSuccess: 0,
      r2DeleteSkippedAfterRetries: 0,
      dbDeleteSkippedStillReferenced: 0,
      storageKeyRejected: 0,
      stoppedEarly: false,
      r2DeleteCapReached: false,
      r2DeleteSkippedDueToCap: 0,
      ...metricsZero,
      rpcErrors,
      r2Errors,
    });
  }

  const rows = asPurgeRows(purgeData);
  const purgeLoopStartedAt = nowMs();
  let r2DeleteSuccess = 0;
  let r2DeleteSkippedAfterRetries = 0;
  let purgedDbRows = 0;
  let dbDeleteSkippedStillReferenced = 0;
  let storageKeyRejected = 0;
  let stoppedEarly = false;
  let r2DeleteCapReached = false;
  let r2DeleteSkippedDueToCap = 0;
  let r2DeleteAttempts = 0;
  const r2DeleteLatenciesMs: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    if (elapsedMs(startedAt) >= UPLOADED_IMAGES_CLEANUP_MAX_MS) {
      stoppedEarly = true;
      rpcErrors.push(`timeout: oprit după ${UPLOADED_IMAGES_CLEANUP_MAX_MS}ms (guard purge)`);
      break;
    }

    const maxR2Deletes = getEffectiveR2DeleteMaxPerTick(startedAt);
    if (maxR2Deletes !== null && r2DeleteAttempts >= maxR2Deletes) {
      r2DeleteCapReached = true;
      r2DeleteSkippedDueToCap = rows.length - i;
      rpcErrors.push(
        `cap: max ${maxR2Deletes} apeluri R2 delete (efectiv; UPLOADED_IMAGES_R2_DELETE_MAX_PER_TICK / dynamic)`
      );
      break;
    }

    if (!isAllowedPurgeStorageKey(row.storage_key)) {
      storageKeyRejected++;
      r2Errors.push(`${row.id}: storage_key invalid (regex uploads/… sau segment ..)`);
      continue;
    }

    r2DeleteAttempts++;
    const tR2 = nowMs();
    try {
      await deleteObjectByKeyWithRetry(cfg, row.storage_key);
      r2DeleteLatenciesMs.push(nowMs() - tR2);
      r2DeleteSuccess++;
    } catch (e: unknown) {
      const kind: ReturnType<typeof classifyR2DeleteError> = classifyR2DeleteError(e);
      errKind[kind]++;
      const label = kind === "network" ? "[network]" : kind === "auth" ? "[auth]" : "[other]";
      const msg = e instanceof Error ? e.message : String(e);
      r2Errors.push(`${row.id}: ${label} ${msg}`);
      r2DeleteSkippedAfterRetries++;
      continue;
    }

    const { data: finalized, error: finErr } = await db.rpc("finalize_uploaded_image_purge", {
      p_id: row.id,
    });

    if (finErr) {
      rpcErrors.push(`finalize_uploaded_image_purge ${row.id}: ${finErr.message}`);
      continue;
    }

    if (finalized === true) {
      purgedDbRows++;
    } else {
      dbDeleteSkippedStillReferenced++;
    }
  }

  const { avg, p95 } = computeLatencyAvgAndP95(r2DeleteLatenciesMs);
  const r2DeleteFailedPermanent = r2DeleteSkippedAfterRetries;
  const purgePhaseMs = elapsedMs(purgeLoopStartedAt);
  const purgeThroughputRowsPerMs = safePurgeThroughputRowsPerMs(purgedDbRows, purgePhaseMs);

  return finish({
    softMarked,
    purgeCandidates: rows.length,
    purgedDbRows,
    r2DeleteSuccess,
    r2DeleteSkippedAfterRetries,
    r2DeleteFailedPermanent,
    dbDeleteSkippedStillReferenced,
    storageKeyRejected,
    stoppedEarly,
    r2DeleteCapReached,
    r2DeleteSkippedDueToCap,
    purgeThroughputRowsPerMs,
    r2DeleteLatencyAvg: avg,
    r2DeleteLatencyP95: p95,
    r2DeleteErrorsByKind: { ...errKind },
    rpcErrors,
    r2Errors,
  });
}
