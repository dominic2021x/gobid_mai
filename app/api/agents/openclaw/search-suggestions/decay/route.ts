/**
 * POST/GET /api/agents/openclaw/search-suggestions/decay
 * Cron zilnic: decay popularity (popularity *= 0.98) pentru toate sugestiile cu popularity > 0.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  return runDecay(req);
}

export async function POST(req: Request) {
  return runDecay(req);
}

async function runDecay(req: Request) {
  try {
    await requireCronSecret(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("run_search_popularity_decay");

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Decay failed", message: error.message },
      { status: 500 }
    );
  }

  const updatedRows = typeof data === "number" ? data : (Array.isArray(data) ? data[0] : 0) ?? 0;

  return NextResponse.json({
    ok: true,
    updatedRows,
  });
}
