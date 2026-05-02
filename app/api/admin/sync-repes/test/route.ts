/**
 * GET – test de conectare la prod.executori.ro/repes (fără scanare).
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchRepesHtml } from "@/lib/scraper-repes/http";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

const TEST_URL = "https://prod.executori.ro/repes";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const html = await fetchRepesHtml(TEST_URL);
    const hasContent = html && html.length > 500;
    return NextResponse.json({
      success: true,
      message: hasContent ? "Conectare reușită la prod.executori.ro/repes" : "Răspuns invalid (prea scurt – posibil site SPA cu conținut încărcat la client).",
      contentLength: html?.length ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { success: false, error: message, message: `Eroare la conectare: ${message}` },
      { status: 500 }
    );
  }
}
