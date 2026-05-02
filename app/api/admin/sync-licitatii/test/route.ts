/**
 * Test de conectare la licitatii-insolventa.ro (fără scanare).
 * GET /api/admin/sync-licitatii/test
 * Face un singur request la /cauta și returnează ok sau eroare rapid.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml } from "@/lib/scraper/http";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const TEST_URL = "https://www.licitatii-insolventa.ro/cauta";
export const runtime = "nodejs";
export const maxDuration = 15;

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let allowed = false;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { data: { user } } = await supabaseAdmin!.auth.getUser(token);
      if (await isAdminUser(user)) allowed = true;
    } catch {
      // ignore
    }
  }
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const html = await fetchHtml(TEST_URL, { timeoutMs: 12000, retries: 1 });
    const hasContent = typeof html === "string" && html.length > 500;
    return NextResponse.json({
      ok: hasContent,
      message: hasContent ? "Conectare reușită la licitatii-insolventa.ro" : "Răspuns invalid (prea scurt)",
      length: html?.length ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, message: `Eroare: ${message}` },
      { status: 200 }
    );
  }
}
