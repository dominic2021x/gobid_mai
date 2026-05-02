/**
 * GET /api/ro/search/suggest/personal – sugestii personale (ultimele căutări user).
 * Doar user logat. Cache private, no-store.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const PersonalSuggestSchema = z.object({
  q: z.string().max(80).optional().transform((s) => (s != null && s !== "" ? s.trim() : undefined)),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const DAYS_AGO = 30;

export type PersonalSuggestItem = {
  phrase: string;
  qNorm: string;
  source: "user";
  lastAt: string;
  count: number;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = PersonalSuggestSchema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? 5,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { q, limit } = parsed.data;
  const since = new Date(Date.now() - DAYS_AGO * 24 * 60 * 60 * 1000).toISOString();

  if (q != null && q !== "") {
    const qNorm = normalizeRo(q);
    if (qNorm.length < 2) {
      return NextResponse.json(
        { ok: true, q: q || null, items: [] },
        { headers: { "Cache-Control": "private, max-age=0" } }
      );
    }

    const { data: rows, error } = await supabase
      .from("search_events")
      .select("q, q_norm, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .or(`q_norm.eq.${qNorm},q_norm.like.${qNorm}%`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Query failed" },
        { status: 500, headers: { "Cache-Control": "private, max-age=0" } }
      );
    }

    const byNorm = new Map<
      string,
      { phrase: string; lastAt: string; count: number; isExact: boolean }
    >();
    for (const r of rows ?? []) {
      const row = r as { q: string; q_norm: string; created_at: string };
      const norm = row.q_norm;
      const existing = byNorm.get(norm);
      if (!existing) {
        byNorm.set(norm, {
          phrase: row.q,
          lastAt: row.created_at,
          count: 1,
          isExact: norm === qNorm,
        });
      } else {
        existing.count++;
        if (row.created_at > existing.lastAt) {
          existing.lastAt = row.created_at;
          existing.phrase = row.q;
        }
      }
    }

    const sorted = [...byNorm.entries()]
      .sort((a, b) => {
        if (a[1].isExact !== b[1].isExact) return a[1].isExact ? -1 : 1;
        if (a[1].lastAt !== b[1].lastAt) return a[1].lastAt > b[1].lastAt ? -1 : 1;
        return b[1].count - a[1].count;
      })
      .slice(0, limit)
      .map(([qNorm, v]) => ({
        phrase: v.phrase,
        qNorm,
        source: "user" as const,
        lastAt: v.lastAt,
        count: v.count,
      }));

    return NextResponse.json(
      { ok: true, q, items: sorted },
      { headers: { "Cache-Control": "private, max-age=0" } }
    );
  }

  const { data: rows, error } = await supabase
    .from("search_events")
    .select("q, q_norm, created_at")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Query failed" },
      { status: 500, headers: { "Cache-Control": "private, max-age=0" } }
    );
  }

  const seen = new Set<string>();
  const items: PersonalSuggestItem[] = [];
  for (const r of rows ?? []) {
    const row = r as { q: string; q_norm: string; created_at: string };
    if (seen.has(row.q_norm)) continue;
    seen.add(row.q_norm);
    items.push({
      phrase: row.q,
      qNorm: row.q_norm,
      source: "user",
      lastAt: row.created_at,
      count: 1,
    });
    if (items.length >= limit) break;
  }

  return NextResponse.json(
    { ok: true, q: null, items },
    { headers: { "Cache-Control": "private, max-age=0" } }
  );
}
