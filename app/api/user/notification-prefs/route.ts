import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
/** GET: Fetch user notification prefs. Auth required. */
export async function GET(request: NextRequest) {
  const user = await getRequestAuthUser(request);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_notification_prefs")
    .select("user_id, push_enabled, email_enabled, quiet_hours_start, quiet_hours_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prefs: data ?? {
      user_id: user.id,
      push_enabled: true,
      email_enabled: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
    },
  });
}

/** PATCH: Update user notification prefs. Auth required. */
export async function PATCH(req: NextRequest) {
  const user = await getRequestAuthUser(req);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    push_enabled?: boolean;
    email_enabled?: boolean;
    quiet_hours_start?: string | null;
    quiet_hours_end?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.push_enabled === "boolean") update.push_enabled = body.push_enabled;
  if (typeof body.email_enabled === "boolean") update.email_enabled = body.email_enabled;
  if (body.quiet_hours_start !== undefined) update.quiet_hours_start = body.quiet_hours_start || null;
  if (body.quiet_hours_end !== undefined) update.quiet_hours_end = body.quiet_hours_end || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_notification_prefs")
    .upsert(update, { onConflict: "user_id" })
    .select("user_id, push_enabled, email_enabled, quiet_hours_start, quiet_hours_end")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prefs: data });
}
