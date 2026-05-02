import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const type = searchParams.get("type")?.trim() || undefined;
  const since = searchParams.get("since")?.trim() || undefined;
  const operation_group = searchParams.get("operation_group")?.trim()?.toLowerCase() || undefined;
  const orderParam = searchParams.get("order")?.toLowerCase();
  const ascending = orderParam === "asc";

  if (!supabaseAdmin) {
    return NextResponse.json({ success: true, events: [] });
  }

  const admin = supabaseAdmin;

  const validGroups = ["tag", "path", "layout", "warmup"];
  const filterByGroup = operation_group && validGroups.includes(operation_group);

  const buildQuery = () => {
    let q = admin
      .from("cache_events")
      // `*` evită 500 când lipsesc coloane (ex. meta între migrații 20260412–20260413).
      .select("*")
      .order("created_at", { ascending })
      .limit(limit);
    if (type) q = q.eq("type", type);
    if (filterByGroup) q = q.like("target", `${operation_group}:%`);
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        q = q.gte("created_at", sinceDate.toISOString());
      }
    }
    return q;
  };

  let { data: rows, error } = await buildQuery();

  // Fără coloana `target`, filtrul .like pe target e invalid — reîncearcă fără grup.
  if (error && filterByGroup) {
    const retry = admin
      .from("cache_events")
      .select("*")
      .order("created_at", { ascending })
      .limit(limit);
    let q2 = type ? retry.eq("type", type) : retry;
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        q2 = q2.gte("created_at", sinceDate.toISOString());
      }
    }
    ({ data: rows, error } = await q2);
  }

  if (error) {
    console.error("[api/admin/cache/events]", error.code ?? "", error.message);
    return NextResponse.json({
      success: true,
      events: [],
      unavailableReason: error.message,
    });
  }

  const events = (rows ?? []).map((e: { target?: string | null; [k: string]: unknown }) => {
    const target = e.target as string | null | undefined;
    const m = target?.match(/^(tag|path|layout|warmup):/);
    const operation_group = m ? m[1] : "";
    return { ...e, operation_group };
  });

  return NextResponse.json({ success: true, events });
}
