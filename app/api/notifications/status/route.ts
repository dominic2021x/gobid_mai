import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

/**
 * GET /api/notifications/status
 * Verifică dacă utilizatorul are dispozitive înregistrate pentru push.
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing access token" }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "").trim();
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authUser?.user?.id) {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }

    const { data: tokens, error } = await supabaseAdmin
      .from("user_push_tokens")
      .select("id, platform, last_seen_at")
      .eq("user_id", authUser.user.id)
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const hasTokens = tokens && tokens.length > 0;
    return NextResponse.json({
      registered: hasTokens,
      deviceCount: tokens?.length ?? 0,
      devices: tokens ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Eroare" },
      { status: 500 }
    );
  }
}
