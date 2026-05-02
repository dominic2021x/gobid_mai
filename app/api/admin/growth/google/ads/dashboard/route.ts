import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const PRODUCT = "google_ads";
const KIND = "ads_dashboard_pack";
const STALE_HOURS = 24;

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const customerId = await getGrowthSetting("google_ads_customer_id");
  if (!customerId?.trim()) {
    return growthJsonError("google_ads_customer_id not set", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_google_snapshots")
    .select("result, created_at")
    .eq("product", PRODUCT)
    .eq("kind", KIND)
    .eq("scope_ref", customerId.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  const createdAt = data?.created_at as string | undefined;
  const now = Date.now();
  const createdMs = createdAt ? new Date(createdAt).getTime() : 0;
  const stale = createdAt == null || now - createdMs > STALE_HOURS * 60 * 60 * 1000;

  return NextResponse.json({
    dashboard: data?.result ?? null,
    generatedAt: (data?.result as Record<string, unknown>)?.generatedAt ?? createdAt,
    stale,
  });
}
