import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";
import { passesCreateLandingGate, type QualityFlag } from "@/lib/growth/supply-gaps/quality";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


function slugFromQNorm(qNorm: string): string {
  return qNorm
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: { gapId?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const gapId = typeof body.gapId === "string" ? body.gapId.trim() : "";
  if (!gapId) return growthJsonError("gapId is required", "BAD_REQUEST", 400);

  const supabase = createAdminClient();
  const { data: gap, error: gapError } = await supabase
    .from("market_supply_gaps")
    .select("q_norm, quality_score, flags")
    .eq("id", gapId)
    .single();
  if (gapError || !gap?.q_norm) return growthJsonError("Gap not found", "NOT_FOUND", 404);

  const flags = (gap.flags ?? []) as QualityFlag[];
  const qualityScore = Number(gap.quality_score ?? 0);
  if (!passesCreateLandingGate({ quality_score: qualityScore, flags })) {
    return NextResponse.json(
      {
        error: "Quality gate failed. Requires quality_score >= 1 and no low_ctr, high_pogo, or ambiguous flags.",
        code: "QUALITY_GATE",
      },
      { status: 422 }
    );
  }

  const slug = slugFromQNorm(gap.q_norm);
  if (!slug) return growthJsonError("Unable to derive slug from q_norm", "BAD_REQUEST", 400);

  const { data: existing } = await supabase.from("seo_landing_pages").select("slug").eq("slug", slug).maybeSingle();
  if (existing) return growthJsonError(`Landing page "${slug}" already exists`, "CONFLICT", 409);

  const row = {
    slug,
    status: "draft",
    title: gap.q_norm,
    meta: null,
    h1: gap.q_norm,
    intro_md: null,
    faq_json: [],
    filters_json: {},
    canonical_url: null,
    noindex: true,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("seo_landing_pages")
    .insert(row)
    .select("slug, status, created_at")
    .single();
  if (insertError) return growthJsonError(insertError.message, "INTERNAL_ERROR", 500);

  await supabase.from("growth_events").insert({
    type: "seo_landing_page_created",
    meta: { slug: inserted.slug, status: inserted.status, source: "supply_gap", gapId },
  });

  return NextResponse.json({ slug: inserted.slug, status: inserted.status, created_at: inserted.created_at });
}
