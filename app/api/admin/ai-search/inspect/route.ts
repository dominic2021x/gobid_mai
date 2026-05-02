/**
 * GET /api/admin/ai-search/inspect
 * Admin-only: inspect a suggestion phrase (source: user-driven | enriched | seed/unknown).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const InspectQuerySchema = z.object({
  phrase: z.string().min(1).max(200).transform((s) => s.trim()),
});

type SourceVerdict = "user-driven" | "enriched" | "seed/unknown";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const parsed = InspectQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store" } }
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
      events_count_30d: 0,
      last_event_at: null,
      synonyms_in: [],
      synonyms_out: [],
      verdict: { source: "seed/unknown" as SourceVerdict },
    });
  }

  const supabase = createAdminClient();

  const { data: suggestionRow, error: suggError } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm, kind, popularity, meta, updated_at")
    .eq("phrase_norm", phrase_norm)
    .limit(1)
    .maybeSingle();

  if (suggError) {
    return NextResponse.json(
      { ok: false, error: suggError.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  type SuggestionDb = {
    id: string;
    phrase: string;
    phrase_norm: string;
    kind: string;
    popularity: number;
    meta: unknown;
    updated_at: string;
  };

  const suggestion_row =
    suggestionRow == null
      ? null
      : (() => {
          const row = suggestionRow as SuggestionDb;
          const meta = row.meta;
          const enriched_at =
            meta != null && typeof meta === "object" && "enriched_at" in meta
              ? (meta as { enriched_at?: string }).enriched_at ?? null
              : null;
          return {
            kind: row.kind,
            popularity: row.popularity,
            meta: row.meta,
            updated_at: row.updated_at,
            enriched_at,
          };
        })();

  const { data: synonymsInRows } = await supabase
    .from("search_suggestion_synonyms")
    .select("from_norm, to_phrase, to_norm, weight")
    .eq("to_norm", phrase_norm)
    .order("weight", { ascending: false })
    .limit(20);

  const { data: synonymsOutRows } = await supabase
    .from("search_suggestion_synonyms")
    .select("from_norm, to_phrase, to_norm, weight")
    .eq("from_norm", phrase_norm)
    .order("weight", { ascending: false })
    .limit(20);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { count: events_count_30d, error: countError } = await supabase
    .from("search_events")
    .select("id", { count: "exact", head: true })
    .eq("q_norm", phrase_norm)
    .gte("created_at", thirtyDaysAgo);

  if (countError) {
    return NextResponse.json(
      { ok: false, error: countError.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data: lastEventRow } = await supabase
    .from("search_events")
    .select("created_at")
    .eq("q_norm", phrase_norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const last_event_at =
    lastEventRow != null && typeof (lastEventRow as { created_at: string }).created_at === "string"
      ? (lastEventRow as { created_at: string }).created_at
      : null;

  const events_count = typeof events_count_30d === "number" ? events_count_30d : 0;

  const synonyms_in = (synonymsInRows ?? []).map((r) => ({
    from_norm: (r as { from_norm: string }).from_norm,
    to_phrase: (r as { to_phrase: string }).to_phrase,
    to_norm: (r as { to_norm: string }).to_norm,
    weight: (r as { weight: number }).weight,
  }));

  const synonyms_out = (synonymsOutRows ?? []).map((r) => ({
    from_norm: (r as { from_norm: string }).from_norm,
    to_phrase: (r as { to_phrase: string }).to_phrase,
    to_norm: (r as { to_norm: string }).to_norm,
    weight: (r as { weight: number }).weight,
  }));

  let source: SourceVerdict = "seed/unknown";
  if (events_count > 0) {
    source = "user-driven";
  } else if (
    suggestion_row?.enriched_at != null ||
    synonyms_in.length > 0 ||
    synonyms_out.length > 0
  ) {
    source = "enriched";
  }

  return NextResponse.json(
    {
      ok: true,
      phrase,
      phrase_norm,
      suggestion_row,
      events_count_30d: events_count,
      last_event_at,
      synonyms_in,
      synonyms_out,
      verdict: { source },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
