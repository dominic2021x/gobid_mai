import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSettingNumber, GROWTH_SETTING_KEYS } from "@/lib/growth/settings";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const supabase = createAdminClient();

  const [stagedRes, indexableRes, lastRunRow, pagesRes] = await Promise.all([
    supabase.from("seo_landing_pages").select("slug", { count: "exact", head: true }).eq("index_stage", "staged"),
    supabase.from("seo_landing_pages").select("slug", { count: "exact", head: true }).eq("index_stage", "indexable"),
    supabase.from("growth_events").select("created_at").in("type", ["pseo_score_and_promote", "pseo_generate_candidates"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("seo_landing_pages").select("slug, index_stage, gsc_impressions_28d, gsc_clicks_28d, last_scored_at").in("index_stage", ["staged", "indexable"]).order("last_scored_at", { ascending: false, nullsFirst: false }).limit(500),
  ]);

  const stagedPages = stagedRes.count ?? 0;
  const indexablePages = indexableRes.count ?? 0;
  const maxIndexablePages = await getGrowthSettingNumber(GROWTH_SETTING_KEYS.pseo_max_indexable_pages, 500);
  const lastRun = (lastRunRow.data as { created_at?: string } | null)?.created_at ?? null;
  const rows = (pagesRes.data ?? []) as Array<{ slug: string; index_stage: string; gsc_impressions_28d: number; gsc_clicks_28d: number; last_scored_at: string | null }>;
  const pages = rows.map((r) => ({
    slug: r.slug,
    stage: r.index_stage,
    impressions: r.gsc_impressions_28d ?? 0,
    clicks: r.gsc_clicks_28d ?? 0,
    ctr: (r.gsc_impressions_28d ?? 0) > 0 ? (r.gsc_clicks_28d ?? 0) / (r.gsc_impressions_28d ?? 1) : 0,
    last_scored_at: r.last_scored_at ?? null,
  }));

  return NextResponse.json({
    stagedPages,
    indexablePages,
    maxIndexablePages,
    lastRun,
    pages,
  });
}
