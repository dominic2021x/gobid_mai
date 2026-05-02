import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const { id } = await params;
  if (!id) return growthJsonError("Missing job id", "BAD_REQUEST", 400);

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  if (body.action !== "requeue") {
    return growthJsonError("Invalid action", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();

  const runAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("growth_jobs")
    .update({
      status: "queued",
      quarantined: false,
      locked_at: null,
      locked_until: null,
      locked_by: null,
      last_error: null,
      run_after: runAfter,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("quarantined", true)
    .select("id, type")
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  if (!data) return growthJsonError("Job not found or not quarantined", "NOT_FOUND", 404);

  return NextResponse.json({
    ok: true,
    jobId: data.id,
    type: data.type,
    runAfter,
  });
}
