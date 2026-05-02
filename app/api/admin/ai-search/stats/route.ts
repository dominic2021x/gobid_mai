/**
 * GET /api/admin/ai-search/stats
 * Admin-only: aggregates over search_events (top queries, unique users, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const StatsQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("7d"),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const parsed = StatsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { range } = parsed.data;
  const hours =
    range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  const [
    { count: totalCount, error: totalErr },
    { data: uniqueUsersData, error: usersErr },
    { data: uniqueIpsData, error: ipsErr },
    { data: topQueriesData, error: topErr },
  ] = await Promise.all([
    supabase
      .from("search_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase
      .from("search_events")
      .select("user_id")
      .gte("created_at", since),
    supabase
      .from("search_events")
      .select("ip_hash")
      .gte("created_at", since),
    supabase
      .from("search_events")
      .select("q_norm, q, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (totalErr || usersErr || ipsErr || topErr) {
    return NextResponse.json(
      {
        ok: false,
        error:
          totalErr?.message ??
          usersErr?.message ??
          ipsErr?.message ??
          topErr?.message,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const totalSearches = typeof totalCount === "number" ? totalCount : 0;
  const rows = (topQueriesData ?? []) as Array<{ q_norm: string; q: string; created_at: string }>;
  const userRows = (uniqueUsersData ?? []) as Array<{ user_id: string | null }>;
  const ipRows = (uniqueIpsData ?? []) as Array<{ ip_hash: string | null }>;

  const uniqueUserIds = new Set<string>();
  for (const r of userRows) {
    if (r.user_id) uniqueUserIds.add(r.user_id);
  }

  const uniqueIpHashes = new Set<string>();
  for (const r of ipRows) {
    if (r.ip_hash) uniqueIpHashes.add(r.ip_hash);
  }

  const byNorm = new Map<
    string,
    { count: number; sample_phrase: string; last_at: string }
  >();
  for (const r of rows) {
    const norm = r.q_norm?.trim() ?? "";
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (!existing) {
      byNorm.set(norm, {
        count: 1,
        sample_phrase: r.q ?? norm,
        last_at: r.created_at ?? "",
      });
    } else {
      existing.count += 1;
      if ((r.created_at ?? "") > existing.last_at) {
        existing.last_at = r.created_at ?? existing.last_at;
        existing.sample_phrase = r.q ?? existing.sample_phrase;
      }
    }
  }

  const topQueries = Array.from(byNorm.entries())
    .map(([q_norm, v]) => ({ q_norm, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return NextResponse.json(
    {
      ok: true,
      range,
      totalSearches,
      uniqueUsers: uniqueUserIds.size,
      uniqueIps: uniqueIpHashes.size,
      topQueries,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
