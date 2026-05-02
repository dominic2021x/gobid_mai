import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: { patches?: Array<{ url: string; title?: string; meta?: string }> } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const patches = Array.isArray(body.patches) ? body.patches : [];
  const valid = patches
    .filter((p) => p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string")
    .slice(0, 100)
    .map((p) => ({
      url: String((p as { url: string }).url).trim(),
      title: typeof (p as { title?: string }).title === "string" ? (p as { title: string }).title : undefined,
      meta: typeof (p as { meta?: string }).meta === "string" ? (p as { meta: string }).meta : undefined,
    }));

  const supabase = createAdminClient();
  try {
    const { jobId } = await enqueueJob(
      { type: "seo_apply_overrides", payload: { patches: valid } },
      supabase
    );
    return NextResponse.json({ jobId, patchCount: valid.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
