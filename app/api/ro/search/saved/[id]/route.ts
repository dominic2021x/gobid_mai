import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const DELIVERY_MODES = new Set(["instant", "daily_digest", "weekly_digest"]);

function parseDeliveryMode(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  return DELIVERY_MODES.has(s) ? s : null;
}

function parseCooldownMinutes(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 1440) return null;
  return n;
}

/** PATCH: Update saved search delivery settings. Auth required. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id", code: "BAD_REQUEST" }, { status: 400 });
  }

  let body: { deliveryMode?: unknown; cooldownMinutes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const deliveryMode = parseDeliveryMode(body.deliveryMode);
  const cooldownMinutes = parseCooldownMinutes(body.cooldownMinutes);
  if (deliveryMode == null && cooldownMinutes == null) {
    return NextResponse.json({ error: "No updates provided", code: "BAD_REQUEST" }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (deliveryMode != null) update.delivery_mode = deliveryMode;
  if (cooldownMinutes != null) update.cooldown_minutes = cooldownMinutes;

  const { data, error } = await admin
    .from("user_saved_searches")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE: Remove saved search. Auth required. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id", code: "BAD_REQUEST" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
