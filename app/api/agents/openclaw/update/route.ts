import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  env: z.string().default("prod"),
  runAudit: z.boolean().default(true),
  runOAuthHealth: z.boolean().default(false),
  allowReindex: z.boolean().default(false),
});

const JOB_TYPE_UPDATE = "openclaw_update";

function hasCronSecret(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const legacy = req.headers.get("x-cron-secret");
  const secret = token ?? legacy;
  return !!secret && secret === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!hasCronSecret(req)) await requireAdmin(req);

  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({ type: JOB_TYPE_UPDATE, status: "queued", payload: body })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, jobId: data.id });
}
