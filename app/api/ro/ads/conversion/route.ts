/**
 * POST /api/ro/ads/conversion – log Google Ads conversion attempt (observability).
 * Auth optional. Writes to growth_events for adblock / missing gtag detection.
 * No PII.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const LABELS = ["signup", "listing_published", "bid_created"] as const;
type Label = (typeof LABELS)[number];

function truncateUA(ua: string | null, maxLen = 200): string {
  if (!ua || typeof ua !== "string") return "";
  return ua.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  let body: { label?: string; dedupeKey?: string; hasGtag?: boolean } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const label = body.label;
  if (!label || !LABELS.includes(label as Label)) {
    return NextResponse.json(
      { error: "label must be one of: signup, listing_published, bid_created" },
      { status: 400 }
    );
  }

  const hasGtag = !!body.hasGtag;
  const dedupeKey = typeof body.dedupeKey === "string" ? body.dedupeKey : undefined;
  const ua = truncateUA(req.headers.get("user-agent"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("growth_events").insert({
    type: "gads_conversion_attempt",
    meta: { label, dedupeKey, hasGtag, ua },
  });

  if (error) {
    console.error("[gads/conversion] insert error:", error);
    return NextResponse.json({ error: "Failed to log" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
