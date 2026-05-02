/**
 * Admin API: inspect pattern for a phrase; blacklist/whitelist phrases.
 * GET ?q=... -> inspect (why accepted/rejected, pattern type, profile).
 * POST { action: "blacklist" | "whitelist", phrase_norm: string, reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeRo } from "@/lib/search/roNormalize";
import { buildMarketplaceTaxonomy } from "@/lib/search/patterns/buildMarketplaceTaxonomy";
import { getProfileForSubcategory } from "@/lib/search/patterns/profiles/getProfileForSubcategory";
import { matchPatternProfile } from "@/lib/search/patterns/matchPatternProfile";
import { scorePatternQuality } from "@/lib/search/patterns/scorePatternQuality";
import { filterPatternCandidate } from "@/lib/search/patterns/quality/filterPatternCandidate";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const category = req.nextUrl.searchParams.get("category") ?? null;
  const subcategory = req.nextUrl.searchParams.get("subcategory") ?? null;
  const phraseNorm = normalizeRo(q);

  if (!phraseNorm || phraseNorm.length < 1) {
    return NextResponse.json(
      { ok: false, error: "Query q required" },
      { status: 400 }
    );
  }

  const taxonomy = buildMarketplaceTaxonomy();
  const profile = getProfileForSubcategory(category, subcategory);

  const match = matchPatternProfile(phraseNorm, { taxonomy, profile });
  const patternQualityScore = scorePatternQuality(match, profile);
  const filterResult = filterPatternCandidate(
    { phrase_norm: phraseNorm },
    { taxonomy, profile }
  );

  return NextResponse.json({
    ok: true,
    phrase_norm: phraseNorm,
    inspect: {
      keep: filterResult.keep,
      reason: filterResult.reason,
      patternType: match.patternType,
      confidence: match.confidence,
      invalid: match.invalid,
      segments: match.segments,
      vertical: match.vertical,
      patternQualityScore: filterResult.patternQualityScore,
      resolved_subcategory: match.segments.subcategory ?? null,
    },
    profile: {
      vertical: profile.vertical,
      minPatternScore: profile.minPatternScore,
      validPatternTypes: profile.validPatternTypes,
      preferredPatternTypes: profile.preferredPatternTypes,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  let body: { action: string; phrase_norm: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { action, phrase_norm, reason } = body;
  const phraseNorm = normalizeRo(phrase_norm ?? "").trim();
  if (!phraseNorm) {
    return NextResponse.json(
      { ok: false, error: "phrase_norm required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  if (action === "blacklist") {
    const { error } = await supabase.from("search_suggestions_blacklist").upsert(
      { phrase_norm: phraseNorm, reason: reason ?? null },
      { onConflict: "phrase_norm" }
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "blacklist", phrase_norm: phraseNorm });
  }

  if (action === "whitelist") {
    const { error } = await supabase.from("search_pattern_whitelist").upsert(
      { phrase_norm: phraseNorm, reason: reason ?? null },
      { onConflict: "phrase_norm" }
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "whitelist", phrase_norm: phraseNorm });
  }

  return NextResponse.json(
    { ok: false, error: "action must be blacklist or whitelist" },
    { status: 400 }
  );
}
