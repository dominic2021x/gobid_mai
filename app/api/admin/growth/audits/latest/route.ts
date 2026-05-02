import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const kind = req.nextUrl.searchParams.get("kind") ?? "seo_audit_run";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_audit_results")
    .select("id, kind, hash, result, created_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  return NextResponse.json({ result: data });
}
