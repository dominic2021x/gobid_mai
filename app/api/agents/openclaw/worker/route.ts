// app/api/agents/openclaw/worker/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSearchAudit } from "@/lib/search/audit";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const JOB_TYPE_UPDATE = "openclaw_update";

const DEFAULT_QUERIES = [
  { q: "apartament 2 camere" },
  { q: "teren intravilan" },
  { q: "teren extravilan" },
  { q: "autoutilitară" },
  { q: "buldoexcavator" },
  { q: "spațiu comercial" },
];

type AgentJobRow = {
  id: string;
  type: string;
  status: string;
  payload: any;
  result: any;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function safeErrMessage(err: unknown) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

function resolveBaseUrl(req: Request) {
  // Prefer server-only env, but always fall back to the request origin (most reliable in Vercel).
  const origin = new URL(req.url).origin;
  const env =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL || // legacy
    "";
  const base = (env || origin).replace(/\/+$/, "");
  return base;
}

async function markJobFailed(supabase: ReturnType<typeof createAdminClient>, jobId: string, err: unknown) {
  const finishedAt = new Date().toISOString();
  const msg = safeErrMessage(err);

  // Include cause if present (Node fetch often hides details behind err.cause)
  const cause = (err as any)?.cause;
  const causeMsg =
    cause instanceof Error ? cause.message : cause ? String(cause) : null;

  const finalMsg = causeMsg ? `${msg} | cause: ${causeMsg}` : msg;

  await supabase
    .from("agent_jobs")
    .update({
      status: "failed",
      finished_at: finishedAt,
      error: finalMsg.slice(0, 4000), // keep it bounded
      result: null,
    })
    .eq("id", jobId);
}

async function markJobSucceeded(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  result: any
) {
  const finishedAt = new Date().toISOString();
  await supabase
    .from("agent_jobs")
    .update({
      status: "succeeded",
      finished_at: finishedAt,
      error: null,
      result,
    })
    .eq("id", jobId);
}

export async function GET(req: Request) {
  const supabase = createAdminClient();
  let claimedJobId: string | null = null;

  try {
    await requireCronSecret(req);

    const url = new URL(req.url);
    const jobIdParam = url.searchParams.get("jobId");

    // 1) Fetch a job (specific or oldest queued; OpenClaw update only; seed-suggestions runs via /api/jobs/seed-suggestions)
    const jobRes = jobIdParam
      ? await supabase.from("agent_jobs").select("*").eq("id", jobIdParam).single()
      : await supabase
          .from("agent_jobs")
          .select("*")
          .eq("type", JOB_TYPE_UPDATE)
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

    if ((jobRes as any).error) {
      const e = (jobRes as any).error;
      console.error("[openclaw.worker] job fetch error:", e);
      return NextResponse.json(
        { ok: false, stage: "job_fetch", error: e.message ?? String(e) },
        { status: 500 }
      );
    }

    const job = (jobRes as any).data as AgentJobRow | null;

    if (!job) {
      return NextResponse.json({ ok: true, message: "No queued jobs found" }, { status: 200 });
    }

    // 2) Claim/mark running (optimistic lock to reduce race)
    const startedAt = new Date().toISOString();
    const claimRes = await supabase
      .from("agent_jobs")
      .update({ status: "running", started_at: startedAt, finished_at: null, error: null })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if ((claimRes as any).error) {
      const e = (claimRes as any).error;
      console.error("[openclaw.worker] mark running error:", e);
      return NextResponse.json(
        { ok: false, stage: "mark_running", error: e.message ?? String(e) },
        { status: 500 }
      );
    }

    const claimed = (claimRes as any).data as AgentJobRow | null;

    if (!claimed) {
      return NextResponse.json({ ok: true, message: "Job already claimed by another worker" }, { status: 200 });
    }

    claimedJobId = claimed.id;

    // 3) Resolve baseUrl reliably (avoid env misconfig)
    const baseUrl = resolveBaseUrl(req);
    if (!baseUrl) {
      const msg = "Missing SITE_URL / NEXT_PUBLIC_SITE_URL and could not resolve origin";
      console.error("[openclaw.worker]", msg);
      await markJobFailed(supabase, claimedJobId, msg);
      return NextResponse.json({ ok: false, stage: "env", error: msg }, { status: 500 });
    }

    // 4) Run audit
    const audit = await runSearchAudit({
      baseUrl,
      queries: DEFAULT_QUERIES,
      k: 10,
      executariToken: null,
    });

    await markJobSucceeded(supabase, claimedJobId, { summary: audit.summary });
    return NextResponse.json({ ok: true, jobId: claimedJobId, summary: audit.summary }, { status: 200 });
  } catch (err: any) {
    // Always log cause (critical for "fetch failed")
    console.error("[openclaw.worker] fatal:", err, err?.cause);

    // Best-effort: mark claimed job failed so it never stays running.
    if (claimedJobId) {
      try {
        await markJobFailed(supabase, claimedJobId, err);
      } catch (e) {
        console.error("[openclaw.worker] failed to mark job failed:", e);
      }
    }

    const status = err?.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { ok: false, stage: "fatal", error: err?.message ?? String(err) },
      { status }
    );
  }
}