import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET - latest traffic_quality_alert events for UI.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_events")
    .select("id, type, meta, created_at")
    .eq("type", "traffic_quality_alert")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ alerts: data ?? [] });
}
