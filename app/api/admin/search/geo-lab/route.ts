/**
 * GET /api/admin/search/geo-lab?q=...
 * Admin-only. Returns parsed intent, geo expansion plan, and progressive tiers for debugging.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { buildSearchPlan } from "@/lib/search/query/buildSearchPlan";
import { buildProgressiveExpansionPlan } from "@/lib/search/listings/buildProgressiveExpansionPlan";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req as NextRequest);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "Missing q" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  try {
    const plan = await buildSearchPlan(q, supabase);
    const progressive = buildProgressiveExpansionPlan(plan.geoPlan, plan.intent, 30);

    return NextResponse.json({
      ok: true,
      query: q,
      intent: {
        queryNorm: plan.intent.queryNorm,
        queryWithoutGeo: plan.intent.queryWithoutGeo,
        categorySlug: plan.intent.categorySlug,
        subcategorySlug: plan.intent.subcategorySlug,
        vertical: plan.intent.vertical,
        isNavigational: plan.intent.isNavigational,
        location: plan.intent.location,
      },
      filters: plan.filters,
      geoPlan: plan.geoPlan
        ? {
            hasGeoIntent: plan.geoPlan.hasGeoIntent,
            tiers: plan.geoPlan.tiers,
          }
        : null,
      progressiveTiers: progressive,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
