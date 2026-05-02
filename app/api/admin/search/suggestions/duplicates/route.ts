/**
 * GET /api/admin/search/suggestions/duplicates
 * Admin-only. Verifică dacă există sugestii cu același phrase_norm din mai multe surse/rânduri.
 * Returnează phrase_norm care au mai mult de un rând, cu source, entity_type, is_public.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

type Row = {
  phrase_norm: string;
  phrase: string;
  kind: string;
  source: string | null;
  entity_type: string | null;
  is_public: boolean;
  id: string;
  rank_score: number | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();

  const { data: allRows, error } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm, kind, source, entity_type, is_public, rank_score")
    .eq("is_active", true)
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const byPhraseNorm = new Map<string, Row[]>();
  for (const r of (allRows ?? []) as Row[]) {
    const key = `${r.phrase_norm}|${r.kind}`;
    if (!byPhraseNorm.has(key)) byPhraseNorm.set(key, []);
    byPhraseNorm.get(key)!.push(r);
  }

  const duplicates: Array<{
    phrase_norm: string;
    kind: string;
    count: number;
    rows: Array<{
      phrase: string;
      source: string | null;
      entity_type: string | null;
      is_public: boolean;
      id: string;
      rank_score: number | null;
    }>;
  }> = [];

  for (const [key, rows] of byPhraseNorm) {
    if (rows.length <= 1) continue;
    const [phrase_norm, kind] = key.split("|");
    duplicates.push({
      phrase_norm,
      kind,
      count: rows.length,
      rows: rows.map((r) => ({
        phrase: r.phrase,
        source: r.source,
        entity_type: r.entity_type,
        is_public: r.is_public,
        id: r.id,
        rank_score: r.rank_score,
      })),
    });
  }

  duplicates.sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    total_duplicate_phrase_norms: duplicates.length,
    explanation:
      "Același phrase_norm (și kind) poate apărea din mai multe surse: seed_titles (entity_type real_estate/auto/''), bootstrap, enrich. RPC-ul de suggest face DISTINCT ON (phrase_norm) și returnează un singur rând per frază.",
    duplicates: duplicates.slice(0, 100),
  });
}
