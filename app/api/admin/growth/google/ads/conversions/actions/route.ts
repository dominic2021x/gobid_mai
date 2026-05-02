import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET: return latest conversion_actions snapshot for google_ads (no Google API call).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_google_snapshots")
    .select("id, result, created_at")
    .eq("product", "google_ads")
    .eq("kind", "conversion_actions")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ snapshot: data });
}

/**
 * POST: enqueue job to create a conversion action (name, optional type).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { name?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }
  const name = (body.name as string)?.trim();
  if (!name) return growthJsonError("Missing name", "BAD_REQUEST", 400);
  const type = (body.type as string) === "PURCHASE" || body.type === "LEAD" ? body.type : "PAGE_LOAD";

  try {
    const { jobId } = await enqueueJob({
      type: "google_ads_conversion_action_create",
      payload: { name, type },
    });
    return NextResponse.json({ jobId, name, type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
