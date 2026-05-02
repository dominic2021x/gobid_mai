/**
 * Cron: recategorization agent for channel=executari_insolventa.
 * Batch 200; taxonomy only (category, subcategory, category_level_3). Does NOT change channel.
 * Respects category_overrides.locked, 24h cooldown. Applies only when confidence=1; else records suggestion.
 */

import { NextRequest, NextResponse } from "next/server";
import { runRecategorizeBatch } from "@/lib/server/recategorize/runBatch";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 20;

function authCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === secret;
}

export async function GET(request: NextRequest) {
  if (!authCron(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runRecategorizeBatch(false);

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        scanned: result.scanned,
        applied: result.applied,
        skipped: result.skipped,
        errors: result.errors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      scanned: result.scanned,
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
