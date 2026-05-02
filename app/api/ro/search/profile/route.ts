import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
/** GET: returns enabled + current prefs summary (no raw history) */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ enabled: false, prefsSummary: null }, { status: 200 });
  }
  const admin = createAdminClient();
  const [optRes, profileRes] = await Promise.all([
    admin.from("search_personal_opt_in").select("enabled").eq("user_id", user.id).maybeSingle(),
    admin.from("user_search_profiles").select("prefs").eq("user_id", user.id).maybeSingle(),
  ]);
  const enabled = (optRes.data as { enabled?: boolean } | null)?.enabled ?? false;
  const prefs = (profileRes.data as { prefs?: Record<string, unknown> } | null)?.prefs ?? {};
  const prefsSummary =
    typeof prefs === "object" && prefs !== null
      ? {
          categoryCount: Object.keys(prefs.category ?? {}).length,
          countyCount: Object.keys(prefs.county ?? {}).length,
          queryCount: Object.keys(prefs.query ?? {}).length,
        }
      : null;
  return NextResponse.json({ enabled, prefsSummary });
}

/** POST: { enabled?: boolean, reset?: boolean } updates opt-in and/or clears prefs */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  const o = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const enabled = typeof o.enabled === "boolean" ? o.enabled : undefined;
  const reset = o.reset === true;
  const admin = createAdminClient();
  if (enabled !== undefined) {
    await admin.from("search_personal_opt_in").upsert(
      { user_id: user.id, enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }
  if (reset) {
    await admin.from("user_search_profiles").upsert(
      { user_id: user.id, prefs: {}, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }
  return NextResponse.json({ ok: true });
}
