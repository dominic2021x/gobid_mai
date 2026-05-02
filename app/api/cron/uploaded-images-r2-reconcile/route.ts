/**
 * Opțional: eșantion R2 vs DB — chei în bucket sub `uploads/` fără rând în `uploaded_images`.
 * Activare: ENABLE_R2_ORPHAN_RECONCILE=true
 * GET + Authorization: Bearer CRON_SECRET
 *
 * Securitate: implicit respinge apeluri de la IP privat/loopback (ex. SSRF).
 * Dev / rețea privată: R2_RECONCILE_ALLOW_PRIVATE_IP=true
 */

import { NextRequest, NextResponse } from "next/server";

import { getClientIpFromRequest, isNonPublicClientIp } from "@/lib/net/client-ip-public";
import { runR2OrphanSampleReconcile } from "@/lib/uploaded-images/r2-orphan-reconcile";
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

  if (process.env.ENABLE_R2_ORPHAN_RECONCILE !== "true") {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Set ENABLE_R2_ORPHAN_RECONCILE=true to run R2 vs DB sample scan.",
    });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin not configured" }, { status: 503 });
  }

  const allowPrivate = process.env.R2_RECONCILE_ALLOW_PRIVATE_IP === "true";
  if (!allowPrivate) {
    const ip = getClientIpFromRequest(request);
    if (ip && isNonPublicClientIp(ip)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: private/loopback client IP (set R2_RECONCILE_ALLOW_PRIVATE_IP=true for dev)" },
        { status: 403 }
      );
    }
  }

  try {
    const t0 = Date.now();
    const result = await runR2OrphanSampleReconcile(supabaseAdmin, { startedAtMs: t0 });
    return NextResponse.json({
      success: true,
      executionMs: Date.now() - t0,
      ...result,
      at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Reconcile error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
