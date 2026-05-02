import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_SECONDS = 60;

export type GrowthJobStatus = "queued" | "locked" | "done" | "failed";

export interface GrowthJobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: GrowthJobStatus;
  attempts: number;
  locked_at: string | null;
  locked_until: string | null;
  locked_by: string | null;
  priority: number | null;
  quarantined: boolean | null;
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobParams {
  type: string;
  payload?: Record<string, unknown>;
  runAfter?: Date;
}

/**
 * Enqueue a job. Returns job id.
 */
export async function enqueueJob(
  params: EnqueueJobParams,
  supabase?: SupabaseClient
): Promise<{ jobId: string }> {
  const db = supabase ?? createAdminClient();
  const runAfter = params.runAfter ?? new Date();
  const { data, error } = await db
    .from("growth_jobs")
    .insert({
      type: params.type,
      payload: params.payload ?? {},
      status: "queued",
      run_after: runAfter.toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("enqueueJob: no id returned");
  return { jobId: data.id };
}

/**
 * Atomically lock the next queued job (status=queued, run_after<=now), ordered by created_at.
 * Returns the locked job or null if none.
 */
export async function lockNextJob(
  supabase?: SupabaseClient
): Promise<GrowthJobRow | null> {
  const db = supabase ?? createAdminClient();
  const { data, error } = await db.rpc("growth_lock_next_job");

  if (error) throw new Error(error.message);
  if (data == null) return null;
  return data as GrowthJobRow;
}

/**
 * Mark job as done and record run.
 */
export async function markJobDone(
  jobId: string,
  meta: Record<string, unknown>,
  supabase?: SupabaseClient
): Promise<void> {
  const db = supabase ?? createAdminClient();
  const { error: updateErr } = await db
    .from("growth_jobs")
    .update({
      status: "done",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);
}

/**
 * Mark job as failed or re-queue with backoff. If attempts >= MAX_ATTEMPTS, set status=failed.
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  backoffSeconds: number = DEFAULT_BACKOFF_SECONDS,
  supabase?: SupabaseClient
): Promise<void> {
  const db = supabase ?? createAdminClient();

  const { data: job, error: fetchErr } = await db
    .from("growth_jobs")
    .select("attempts")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) throw new Error(fetchErr?.message ?? "Job not found");

  const attempts = (job.attempts as number) ?? 0;
  const nextAttempts = attempts + 1;
  const isFinal = nextAttempts >= MAX_ATTEMPTS;

  if (isFinal) {
    const { error: updateErr } = await db
      .from("growth_jobs")
      .update({
        status: "failed",
        last_error: errorMessage.slice(0, 4000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (updateErr) throw new Error(updateErr.message);
    return;
  }

  const runAfter = new Date(Date.now() + backoffSeconds * 1000);
  const { error: updateErr } = await db
    .from("growth_jobs")
    .update({
      status: "queued",
      locked_at: null,
      last_error: errorMessage.slice(0, 4000),
      run_after: runAfter.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateErr) throw new Error(updateErr.message);
}

/**
 * Insert a job run row (started). Call from worker; then update finished_at/ok/error when done.
 */
export async function insertJobRun(
  jobId: string,
  correlationId: string,
  supabase?: SupabaseClient
): Promise<{ runId: string }> {
  const db = supabase ?? createAdminClient();
  const { data, error } = await db
    .from("growth_job_runs")
    .insert({
      job_id: jobId,
      correlation_id: correlationId,
      meta: {},
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("insertJobRun: no id returned");
  return { runId: data.id };
}

/**
 * Update job run with result (finished_at, ok, error, meta).
 */
export async function updateJobRun(
  runId: string,
  result: {
    finished_at: string;
    ok: boolean;
    error?: string | null;
    meta?: Record<string, unknown>;
  },
  supabase?: SupabaseClient
): Promise<void> {
  const db = supabase ?? createAdminClient();
  const { error } = await db
    .from("growth_job_runs")
    .update({
      finished_at: result.finished_at,
      ok: result.ok,
      error: result.error ?? null,
      meta: result.meta ?? {},
    })
    .eq("id", runId);

  if (error) throw new Error(error.message);
}
