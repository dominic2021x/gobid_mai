/**
 * POST: Record notification click for feedback (user_search_profiles, CTR tuning).
 * Auth optional; sessionId accepted for anonymous.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_KINDS = new Set(["saved_search_instant", "digest"]);

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) userId = user.id;

  let body: { notificationId?: string; listingId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : "";
  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";

  if (!notificationId || !listingId) {
    return NextResponse.json({ error: "Missing notificationId or listingId", code: "BAD_REQUEST" }, { status: 400 });
  }

  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind", code: "BAD_REQUEST" }, { status: 400 });
  }

  const sessionId = req.headers.get("x-session-id") || req.cookies.get("session_id")?.value || null;

  const admin = createAdminClient();
  const { error } = await admin.from("user_notification_events").insert({
    notification_id: notificationId,
    listing_id: listingId,
    kind,
    user_id: userId,
    session_id: sessionId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
