import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();
  try {
    const [rankSnap, ctrSnap, hubPages, expCount] = await Promise.all([
      supabase.from("growth_google_snapshots").select("result, created_at").eq("product", "flywheel").eq("kind", "ranked_opportunities").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("growth_google_snapshots").select("result, created_at").eq("product", "flywheel").eq("kind", "ctr_experiments_status").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("seo_hub_pages").select("slug, status, title, links_json").order("slug").limit(100),
      supabase.from("seo_ctr_experiments").select("id", { count: "exact", head: true }),
    ]);

    const ranked = rankSnap.data?.result ?? null;
    const rankedAt = (rankSnap.data as { created_at?: string } | null)?.created_at ?? null;
    const ctrStatus = ctrSnap.data?.result ?? null;
    const ctrAt = (ctrSnap.data as { created_at?: string } | null)?.created_at ?? null;
    const hubs = hubPages.data ?? [];
    const experimentsTotal = expCount.count ?? 0;

    return NextResponse.json({
      rankedOpportunities: ranked,
      rankedOpportunitiesAt: rankedAt,
      ctrExperimentsStatus: ctrStatus,
      ctrExperimentsStatusAt: ctrAt,
      hubPages: hubs,
      experimentsTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
