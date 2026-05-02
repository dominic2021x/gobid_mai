/**
 * GET /api/admin/search/suggestions/inspect?phrase=...
 * Debug: arată de unde vine o sugestie (search_suggestions, synonyms, search_events).
 * Protejat: admin (is_admin) sau requireCronSecret.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const QuerySchema = z.object({
  phrase: z.string().min(1).max(200).transform((s) => s.trim()),
});

async function ensureCronOrAdmin(req: NextRequest): Promise<boolean> {
  try {
    await requireCronSecret(req);
    return true;
  } catch {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token) return false;
    const supabase = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return false;
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    return profile?.is_admin === true;
  }
}

export async function GET(req: NextRequest) {
  const allowed = await ensureCronOrAdmin(req);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const phrase = parsed.data.phrase;
  const phrase_norm = normalizeRo(phrase);
  if (!phrase_norm) {
    return NextResponse.json({
      ok: true,
      phrase,
      phrase_norm: "",
      suggestion_row: null,
      synonyms_in: [],
      events_count_30d: 0,
      last_event_at: null,
      interpretation: "phrase_norm gol după normalizare",
    });
  }

  const supabase = createAdminClient();

  const { data: suggestionRows, error: suggError } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm, kind, popularity, meta, updated_at")
    .eq("phrase_norm", phrase_norm)
    .limit(1)
    .maybeSingle();

  if (suggError) {
    return NextResponse.json(
      { ok: false, error: suggError.message },
      { status: 500 }
    );
  }

  const suggestion_row =
    suggestionRows == null
      ? null
      : {
          kind: (suggestionRows as { kind: string }).kind,
          popularity: (suggestionRows as { popularity: number }).popularity,
          meta: (suggestionRows as { meta: unknown }).meta,
          updated_at: (suggestionRows as { updated_at: string }).updated_at,
        };

  const { data: synonymsRows } = await supabase
    .from("search_suggestion_synonyms")
    .select("from_norm, to_phrase, to_norm, weight")
    .eq("to_norm", phrase_norm)
    .order("weight", { ascending: false })
    .limit(10);

  const synonyms_in = (synonymsRows ?? []).map((r) => ({
    from_norm: (r as { from_norm: string }).from_norm,
    to_phrase: (r as { to_phrase: string }).to_phrase,
    to_norm: (r as { to_norm: string }).to_norm,
    weight: (r as { weight: number }).weight,
  }));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { count: events_count_30d, error: countError } = await supabase
    .from("search_events")
    .select("id", { count: "exact", head: true })
    .eq("q_norm", phrase_norm)
    .gte("created_at", thirtyDaysAgo);

  if (countError) {
    return NextResponse.json(
      { ok: false, error: countError.message },
      { status: 500 }
    );
  }

  const { data: lastEventRows } = await supabase
    .from("search_events")
    .select("created_at")
    .eq("q_norm", phrase_norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const last_event_at =
    lastEventRows != null && typeof (lastEventRows as { created_at: string }).created_at === "string"
      ? (lastEventRows as { created_at: string }).created_at
      : null;

  const events_count = typeof events_count_30d === "number" ? events_count_30d : 0;

  let interpretation: string;
  if (events_count > 0) {
    interpretation = "likely user-driven (există căutări în ultimele 30 zile)";
  } else if (synonyms_in.length > 0) {
    interpretation = "likely enrich-generated (există sinonime care expand la această frază)";
  } else if (suggestion_row && (suggestion_row.popularity ?? 0) > 0) {
    interpretation =
      "popularity > 0 dar fără events recente – verifică retenția sau logs vechi / bootstrap";
  } else {
    interpretation = "nu există în search_suggestions sau fără trafic/sinonime";
  }

  return NextResponse.json({
    ok: true,
    phrase,
    phrase_norm,
    suggestion_row,
    synonyms_in,
    events_count_30d: events_count,
    last_event_at,
    interpretation,
  });
}
