import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const DEFAULT_N = 50;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { searchParams } = new URL(req.url);
  const n = Math.min(100, Math.max(1, Number(searchParams.get("n")) || DEFAULT_N));

  const supabase = createAdminClient();
  const { data: logs, error } = await supabase
    .from("search_explain_logs")
    .select("id, q_norm, intent, filters, timing, top_signals, created_at")
    .order("created_at", { ascending: false })
    .limit(n);

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  const intentCount = new Map<string, number>();
  const slowest: Array<{ q_norm: string; timing: Record<string, number>; created_at: string }> = [];
  for (const row of logs ?? []) {
    const r = row as { intent?: string; timing?: Record<string, number>; q_norm?: string; created_at?: string };
    if (r.intent) intentCount.set(r.intent, (intentCount.get(r.intent) ?? 0) + 1);
    if (r.timing && typeof r.timing === "object") {
      const total = Object.values(r.timing).reduce((a, b) => a + Number(b), 0);
      slowest.push({ q_norm: r.q_norm ?? "", timing: r.timing, created_at: r.created_at ?? "" });
    }
  }
  slowest.sort((a, b) => {
    const ta = Object.values(a.timing).reduce((x, y) => x + Number(y), 0);
    const tb = Object.values(b.timing).reduce((x, y) => x + Number(y), 0);
    return tb - ta;
  });

  return NextResponse.json({
    logs: logs ?? [],
    commonIntents: Array.from(intentCount.entries()).map(([intent, count]) => ({ intent, count })),
    slowest: slowest.slice(0, 10),
  });
}
