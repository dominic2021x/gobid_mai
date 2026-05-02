/**
 * POST: trigger recategorization agent (same logic as cron). Admin only.
 * Returns summary + detailed log of each product change (ce produs, ce categorii avea, ce categorii a primit).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { runRecategorizeBatch } from "@/lib/server/recategorize/runBatch";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const result = await runRecategorizeBatch(true);

  return NextResponse.json({
    success: result.success,
    scanned: result.scanned,
    applied: result.applied,
    skipped: result.skipped,
    errors: result.errors,
    changes: result.changes,
  });
}
