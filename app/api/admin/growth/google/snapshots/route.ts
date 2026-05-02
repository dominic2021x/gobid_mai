import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET ?product=google_ads|search_console|ga4&kind=report|performance|conversion_actions
 * Returns latest snapshot for that product+kind.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const product = req.nextUrl.searchParams.get("product");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!product || !kind) {
    return growthJsonError("Missing product or kind", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_google_snapshots")
    .select("id, product, kind, scope_ref, result, created_at")
    .eq("product", product)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ snapshot: data });
}
