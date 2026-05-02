/**
 * Cron: curățare imagini R2 orfane (soft-delete → grace 24h → purge).
 * GET + Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";

import { runUploadedImagesCleanupTick } from "@/lib/uploaded-images/cleanup-worker";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 120;

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

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin not configured" }, { status: 503 });
  }

  try {
    const result = await runUploadedImagesCleanupTick(supabaseAdmin);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cleanup error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
