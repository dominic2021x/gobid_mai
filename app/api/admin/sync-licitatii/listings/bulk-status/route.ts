/**
 * POST – marchează listări ca șterse (deleted_at) sau le reactivează (deleted_at = null).
 * Sincronizează și produsul pe site: status 'ended' la dezactivare, 'active' la reactivare.
 * Body: { ids: string[], deleted: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { syncProductStatusForListings } from "@/lib/licitatii-insolventa-sync-products";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
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

  let body: { ids?: string[]; deleted?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  const deleted = body.deleted === true;

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids (array) is required and must not be empty" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const updatePayloadWithReactivated = deleted
    ? { deleted_at: nowIso, reactivated_at: null }
    : { deleted_at: null, reactivated_at: nowIso };
  const updatePayloadFallback = deleted
    ? { deleted_at: nowIso }
    : { deleted_at: null };

  let result = await db
    .from("licitatii_insolventa_listings")
    .update(updatePayloadWithReactivated)
    .in("id", ids);

  if (result.error && (result.error.message?.includes("reactivated_at") ?? result.error.message?.includes("does not exist"))) {
    result = await db
      .from("licitatii_insolventa_listings")
      .update(updatePayloadFallback)
      .in("id", ids);
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const { updated: productsUpdated } = await syncProductStatusForListings(ids, deleted);

  return NextResponse.json({
    success: true,
    updated: ids.length,
    deleted,
    productsUpdated,
  });
}
