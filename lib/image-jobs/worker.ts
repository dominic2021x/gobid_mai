import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IMAGE_JOB_BATCH_LIMIT, IMAGE_JOB_WORKER_CONCURRENCY } from "./constants";
import { runImageJobWithRetries } from "./process-image-job";
import type { ImageJobRow } from "./types";

const STALE_LOCK_INTERVAL = "15 minutes";

export async function runImageJobsWorkerTick(db: SupabaseClient): Promise<{
  resetStale: number;
  claimed: number;
  finished: number;
  errors: string[];
}> {
  const errors: string[] = [];

  const { data: resetN, error: resetErr } = await db.rpc("reset_stale_image_jobs", {
    p_stale_after: STALE_LOCK_INTERVAL,
  });
  if (resetErr) {
    errors.push(`reset_stale_image_jobs: ${resetErr.message}`);
  }

  const { data: jobs, error: claimErr } = await db.rpc("claim_image_jobs", {
    p_limit: IMAGE_JOB_BATCH_LIMIT,
  });

  if (claimErr) {
    return {
      resetStale: typeof resetN === "number" ? resetN : 0,
      claimed: 0,
      finished: 0,
      errors: [...errors, `claim_image_jobs: ${claimErr.message}`],
    };
  }

  const list = (jobs ?? []) as ImageJobRow[];
  if (list.length === 0) {
    return {
      resetStale: typeof resetN === "number" ? resetN : 0,
      claimed: 0,
      finished: 0,
      errors,
    };
  }

  const limit = pLimit(IMAGE_JOB_WORKER_CONCURRENCY);
  await Promise.all(
    list.map((job) =>
      limit(async () => {
        try {
          await runImageJobWithRetries(db, job);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${job.id}: ${msg}`);
          await db
            .from("image_jobs")
            .update({
              status: "failed",
              error_message: msg.slice(0, 2000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      })
    )
  );

  return {
    resetStale: typeof resetN === "number" ? resetN : 0,
    claimed: list.length,
    finished: list.length,
    errors,
  };
}

/**
 * Rulează tick-uri worker până nu mai există job-uri `pending` / `processing` pentru produs.
 * Folosit la import (CSV etc.) ca să nu depindă exclusiv de cron-ul `/api/cron/image-jobs`.
 */
export async function drainImageJobsForProductId(
  db: SupabaseClient,
  productId: string,
  maxTicks = 120
): Promise<{ ticks: number; errors: string[] }> {
  const errors: string[] = [];
  let ticks = 0;

  while (ticks < maxTicks) {
    const { data: open, error } = await db
      .from("image_jobs")
      .select("id")
      .eq("product_id", productId)
      .in("status", ["pending", "processing"])
      .limit(1);

    if (error) {
      errors.push(`drain: ${error.message}`);
      break;
    }
    if (!open?.length) break;

    const r = await runImageJobsWorkerTick(db);
    errors.push(...r.errors);
    ticks += 1;

    if (r.claimed === 0) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  if (ticks >= maxTicks) {
    const { data: still } = await db
      .from("image_jobs")
      .select("id")
      .eq("product_id", productId)
      .in("status", ["pending", "processing"])
      .limit(1);
    if (still?.length) {
      console.warn(
        `[image-jobs] drainImageJobsForProductId: atins maxTicks=${maxTicks}; produs ${productId} încă are job-uri deschise.`,
      );
    }
  }

  return { ticks, errors };
}
