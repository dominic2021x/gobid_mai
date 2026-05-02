import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateJobRun } from "@/lib/growth/jobs";

/**
 * Mark job as done, clear locks, and write growth_job_runs ok/meta.
 * Call after successful job execution. runId from insertJobRun at job start.
 */
export async function completeJob(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    runId: string;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  const { jobId, runId, meta = {} } = params;

  const finishedAt = new Date().toISOString();
  await updateJobRun(
    runId,
    {
      finished_at: finishedAt,
      ok: true,
      meta,
    },
    supabase
  );

  const { error } = await supabase
    .from("growth_jobs")
    .update({
      status: "done",
      locked_at: null,
      locked_until: null,
      locked_by: null,
      last_error: null,
      updated_at: finishedAt,
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}
