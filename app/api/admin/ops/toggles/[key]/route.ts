import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_KEYS = [
  "ads_optimizer_enabled",
  "ads_optimizer_auto_apply_enabled",
  "growth_os_enabled",
  "pseo_enabled",
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const { key } = await params;
  if (!key || !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
    return growthJsonError(`Invalid toggle key: ${key}`, "BAD_REQUEST", 400);
  }

  let body: { value?: boolean };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  const value = typeof body?.value === "boolean" ? body.value : true;

  const supabase = createAdminClient();

  const { error: upsertErr } = await supabase
    .from("growth_settings")
    .upsert(
      { key, value: value as unknown, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (upsertErr) return growthJsonError(upsertErr.message, "INTERNAL_ERROR", 500);

  const { data: eventRow, error: insertErr } = await supabase
    .from("growth_events")
    .insert({
      type: "ops_toggle",
      meta: {
        key,
        value,
        action: value ? "activated" : "deactivated",
      },
    })
    .select("id")
    .single();

  if (insertErr) {
    // Non-fatal; settings were updated
  }

  return NextResponse.json({
    value,
    eventId: eventRow?.id ?? null,
  });
}
