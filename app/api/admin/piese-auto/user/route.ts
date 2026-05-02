/**
 * GET /api/admin/piese-auto/user?userId=uuid
 * Detalii cont dealer piese auto + flag aprobare import CSV (support).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Parametrul userId este obligatoriu." }, { status: 400 });
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
    .select("account_type, email, first_name, last_name, piese_auto_csv_import_approved")
    .eq("user_id", userId)
    .maybeSingle();

  const profRow = prof as {
    account_type?: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    piese_auto_csv_import_approved?: boolean | null;
  } | null;

  const profileAccountType = profRow?.account_type ?? null;
  const isPieseAuto =
    metaType === "piese_auto" || profileAccountType === "piese_auto";

  return NextResponse.json({
    userId: u.id,
    email: u.email ?? profRow?.email ?? null,
    fullName:
      typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name : null,
    firstName: profRow?.first_name ?? null,
    lastName: profRow?.last_name ?? null,
    accountTypeMetadata: metaType,
    accountTypeProfile: profileAccountType,
    isPieseAuto,
    csvImportApproved: profRow?.piese_auto_csv_import_approved === true,
  });
}
