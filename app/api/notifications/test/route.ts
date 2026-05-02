import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendUserPushNotification } from "@/lib/push/sendUserPushNotification";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

/**
 * POST /api/notifications/test
 * Trimite o notificare de test utilizatorului curent (pentru verificare).
 */
export async function POST(request: NextRequest) {
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

    const { data: tokens } = await supabaseAdmin
      .from("user_push_tokens")
      .select("id, push_token")
      .eq("user_id", authUser.user.id)
      .eq("is_active", true);

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Nu ai niciun dispozitiv înregistrat. Deschide aplicația, fii logat și acordă permisiunea de notificări.",
      }, { status: 400 });
    }

    const hasFcm =
      (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim() !== "" ||
      (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH || "").trim() !== "" ||
      (process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY || "").trim() !== "";
    if (!hasFcm) {
      return NextResponse.json({
        success: false,
        error: "Serviciul de notificări nu este configurat pe server. Contactează administratorul.",
      }, { status: 503 });
    }

    await sendUserPushNotification({
      userId: authUser.user.id,
      title: "Test gobid.ro",
      body: "Notificarea funcționează! Vezi mesajul pe ecran.",
      data: { type: "test" },
    });

    return NextResponse.json({
      success: true,
      message: "Notificare de test trimisă. Verifică pe telefon (și în bara de notificări).",
    });
  } catch (error: any) {
    console.error("[API notifications/test]", error);
    return NextResponse.json(
      { error: error?.message || "Eroare la trimitere" },
      { status: 500 }
    );
  }
}
