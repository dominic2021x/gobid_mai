import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const customerId = await getGrowthSetting("google_ads_customer_id");
  if (!customerId?.trim()) {
    return NextResponse.json({ plan: null });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_ai_plans")
    .select("id, product, scope_ref, plan, status, created_at, updated_at")
    .eq("product", "google_ads")
    .eq("scope_ref", customerId.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ plan: data });
}
