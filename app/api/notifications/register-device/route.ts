import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing access token" }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "").trim();
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authUser?.user?.id) {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      platform?: string;
      appVersion?: string;
      deviceId?: string;
      remove?: boolean;
    };

    const token = String(body.token || "").trim();
    const platform = String(body.platform || "").trim() || "native";
    const appVersion = String(body.appVersion || "").trim() || null;
    const deviceId = String(body.deviceId || "").trim() || null;
    const remove = Boolean(body.remove);

    if (!token) {
      return NextResponse.json({ error: "Missing device token" }, { status: 400 });
    }

    if (remove) {
      const { error } = await supabaseAdmin
        .from("user_push_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", authUser.user.id)
        .eq("push_token", token);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, removed: true });
    }

    const { error } = await supabaseAdmin
      .from("user_push_tokens")
      .upsert(
        {
          user_id: authUser.user.id,
          push_token: token,
          platform,
          app_version: appVersion,
          device_id: deviceId,
          is_active: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "push_token" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

