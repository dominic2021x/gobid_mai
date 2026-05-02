import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateJobRun } from "@/lib/growth/jobs";

const MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_SECONDS = 60;
const LAST_ERROR_MAX_LEN = 500;

/**
 * Handle job failure: increment attempts, set run_after backoff, store last_error (truncate 500 chars).
 * On attempts >= 5: set quarantined=true, status='failed', write growth_events type 'job_quarantined'.
 * runId from insertJobRun at job start.
 */
export interface FailJobParams {
  jobId: string;
  runId: string;
  correlationId: string;
  errorMessage: string;
  backoffSeconds?: number;
  /** Quarantine immediately (e.g. unknown job type - do not retry forever) */
  immediateQuarantine?: boolean;
}

export async function failJob(
  supabase: SupabaseClient,
  params: FailJobParams
): Promise<void> {
  const {
    jobId,
    runId,
    correlationId,
    errorMessage,
    backoffSeconds = DEFAULT_BACKOFF_SECONDS,
    immediateQuarantine = false,
  } = params;

  const truncatedError = errorMessage.slice(0, LAST_ERROR_MAX_LEN);

  const { data: job, error: fetchErr } = await supabase
    .from("growth_jobs")
    .select("attempts, type")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) throw new Error(fetchErr?.message ?? "Job not found");

  const attempts = (job.attempts as number) ?? 0;
  const isQuarantine = immediateQuarantine || attempts >= MAX_ATTEMPTS;
  const finishedAt = new Date().toISOString();
  await updateJobRun(
    runId,
    {
      finished_at: finishedAt,
      ok: false,
      error: truncatedError,
      meta: {},
    },
    supabase
  );

  if (isQuarantine) {
    await supabase.from("growth_events").insert({
      type: "job_quarantined",
      meta: {
        job_id: jobId,
        job_type: (job as { type?: string }).type ?? null,
        correlation_id: correlationId,
        attempts,
        last_error: truncatedError,
      },
    });

    const { error: updateErr } = await supabase
      .from("growth_jobs")
      .update({
        status: "failed",
        quarantined: true,
        locked_at: null,
        locked_until: null,
        locked_by: null,
        last_error: truncatedError,
        updated_at: finishedAt,
      })
      .eq("id", jobId);

    if (updateErr) throw new Error(updateErr.message);
    return;
  }

  const runAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  const { error: updateErr } = await supabase
    .from("growth_jobs")
    .update({
      status: "queued",
      locked_at: null,
      locked_until: null,
      locked_by: null,
      last_error: truncatedError,
      run_after: runAfter,
      updated_at: finishedAt,
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);
}
