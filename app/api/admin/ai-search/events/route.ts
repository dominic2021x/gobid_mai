/**
 * GET /api/admin/ai-search/events
 * Admin-only: list search_events with filters and cursor pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const EventsQuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.trim())
    .optional(),
  mode: z.enum(["prefix", "contains"]).default("prefix"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(), // "created_at,id" for cursor pagination
});

type EventRow = {
  id: string;
  created_at: string;
  q: string;
  q_norm: string;
  user_id: string | null;
  ip_hash: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const parsed = EventsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { q, mode, from, to, userId, limit, cursor } = parsed.data;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : now;

  const supabase = createAdminClient();

  let query = supabase
    .from("search_events")
    .select("id, created_at, q, q_norm, user_id, ip_hash")
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (userId) query = query.eq("user_id", userId);

  if (q) {
    const qNorm = normalizeRo(q);
    if (qNorm) {
      if (mode === "contains") {
        query = query.ilike("q_norm", `%${qNorm.replace(/%/g, "\\%")}%`);
      } else {
        query = query.ilike("q_norm", `${qNorm.replace(/%/g, "\\%")}%`);
      }
    }
  }

  if (cursor) {
    const parts = cursor.split("|");
    const cursorTime = parts[0];
    const cursorId = parts[1];
    if (cursorTime && cursorId) {
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`
      );
    }
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const items = (rows ?? []) as EventRow[];
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const last = resultItems[resultItems.length - 1];
  const nextCursor =
    hasMore && last
      ? `${(last as EventRow).created_at}|${(last as EventRow).id}`
      : null;

  return NextResponse.json(
    {
      ok: true,
      items: resultItems.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        q: r.q,
        q_norm: r.q_norm,
        user_id: r.user_id ?? null,
        ip_hash: r.ip_hash ?? null,
      })),
      nextCursor,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
