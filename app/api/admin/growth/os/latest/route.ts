import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const PRODUCT = "growth_os";
const KIND = "daily_pack";

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const siteUrl = await getGrowthSetting("gsc_site_url");
  const scope = siteUrl?.trim() ?? "";

  const { data: packRow, error: packErr } = await supabase
    .from("growth_google_snapshots")
    .select("result, created_at")
    .eq("product", PRODUCT)
    .eq("kind", KIND)
    .eq("scope_ref", "default")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (packErr) return growthJsonError(packErr.message, "INTERNAL_ERROR", 500);

  const dailyPack = packRow?.result as Record<string, unknown> | null;
  let seoOpportunities = null;
  let seoInternalLinkPlan = null;
  let keywordClusters = null;
  let contentBriefs = null;

  if (scope) {
    const [seoOpp, seoLink, kw, content] = await Promise.all([
      supabase
        .from("growth_google_snapshots")
        .select("result, created_at")
        .eq("product", "seo")
        .eq("kind", "opportunities")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("growth_google_snapshots")
        .select("result, created_at")
        .eq("product", "seo")
        .eq("kind", "internal_link_plan")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("growth_google_snapshots")
        .select("result, created_at")
        .eq("product", "keywords")
        .eq("kind", "clusters")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("growth_google_snapshots")
        .select("result, created_at")
        .eq("product", "content")
        .eq("kind", "briefs")
        .eq("scope_ref", scope)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    seoOpportunities = seoOpp.data?.result ?? null;
    seoInternalLinkPlan = seoLink.data?.result ?? null;
    keywordClusters = kw.data?.result ?? null;
    contentBriefs = content.data?.result ?? null;
  }

  return NextResponse.json({
    dailyPack: dailyPack ?? null,
    dailyPackAt: (packRow as { created_at?: string } | null)?.created_at ?? null,
    seoOpportunities,
    seoInternalLinkPlan,
    keywordClusters,
    contentBriefs,
  });
}
