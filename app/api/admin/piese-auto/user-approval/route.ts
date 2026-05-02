/**
 * POST /api/admin/piese-auto/user-approval
 * Body: { userId: string, approved: boolean }
 * Marchează contul ca validat de support pentru import CSV din admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let body: { userId?: string; approved?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalid." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const approved = body.approved === true;
  if (!userId) {
    return NextResponse.json({ error: "userId este obligatoriu." }, { status: 400 });
  }

  const { data: ures, error: uerr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (uerr || !ures?.user) {
    return NextResponse.json({ error: "Utilizatorul nu a fost găsit." }, { status: 404 });
  }

  const u = ures.user;
  const metaType =
    typeof u.user_metadata?.account_type === "string" ? u.user_metadata.account_type : null;

  const { data: prof } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, account_type")
    .eq("user_id", userId)
    .maybeSingle();

  const profRow = prof as { user_id?: string; account_type?: string | null } | null;
  const isPieseAuto =
    metaType === "piese_auto" || profRow?.account_type === "piese_auto";

  if (!isPieseAuto) {
    return NextResponse.json(
      { error: "Poți aproba doar conturi cu tip „piese auto” (metadata sau profil)." },
      { status: 400 }
    );
  }

  if (profRow?.user_id) {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({ piese_auto_csv_import_approved: approved })
      .eq("user_id", userId);
    if (error) {
      console.error("[admin/piese-auto/user-approval] update", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabaseAdmin.from("user_profiles").insert({
      user_id: userId,
      account_type: "piese_auto",
      piese_auto_csv_import_approved: approved,
    });
    if (error) {
      console.error("[admin/piese-auto/user-approval] insert", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, userId, piese_auto_csv_import_approved: approved });
}
