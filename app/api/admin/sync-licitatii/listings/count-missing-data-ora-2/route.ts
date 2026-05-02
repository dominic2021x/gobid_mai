/**
 * GET – returnează câte anunțuri încă nu au "Data licitatie 2" / "Ora licitatie 2" completate.
 * Folosit în admin pentru a afișa „X rămase”.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: NextRequest) {
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

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const db = supabaseAdmin;

  const { data, error } = await db.rpc("get_licitatii_count_missing_data_ora2");
  if (error) {
    console.warn("[count-missing-data-ora-2] RPC error:", error.message);
    return NextResponse.json({ count: 0 });
  }
  const raw = Array.isArray(data) ? data[0] : data;
  const count = typeof raw === "number" ? raw : Number(raw ?? 0);
  return NextResponse.json({ count: Math.max(0, Math.floor(count)) });
}
