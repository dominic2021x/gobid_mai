/**
 * Public search tracking: click / satisfaction. No auth. Strict validation. sendBeacon-friendly.
 * Rate limit: in-memory + IP hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const RATE_LIMIT_PER_MIN = 180;
const RATE_WINDOW_MS = 60_000;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s: unknown): s is string {
  return typeof s === "string" && uuidRe.test(s);
}

const ipTimestamps = new Map<string, number[]>();
function pruneAndCheckRate(ipKey: string): boolean {
  const now = Date.now();
  let list = ipTimestamps.get(ipKey) ?? [];
  list = list.filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT_PER_MIN) return false;
  list.push(now);
  ipTimestamps.set(ipKey, list);
  return true;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0.0.0.0").slice(0, 45);
}

export async function POST(req: NextRequest) {
  const ipKey = getClientIp(req);
  if (!pruneAndCheckRate(ipKey)) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMIT" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be object", code: "INVALID_BODY" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const type = o.type;
  if (type !== "click" && type !== "satisfaction") {
    return NextResponse.json({ error: "type must be click or satisfaction", code: "INVALID_TYPE" }, { status: 400 });
  }
  if (!isUuid(o.impressionId)) {
    return NextResponse.json({ error: "Invalid impressionId uuid", code: "INVALID_IMPRESSION_ID" }, { status: 400 });
  }
  const listingId = typeof o.listingId === "string" ? o.listingId.trim().slice(0, 64) : "";
  if (!listingId) {
    return NextResponse.json({ error: "listingId required", code: "INVALID_LISTING_ID" }, { status: 400 });
  }
  const pos = typeof o.pos === "number" && Number.isInteger(o.pos) && o.pos >= 0 ? o.pos : 0;
  const dwellMs = typeof o.dwellMs === "number" && Number.isFinite(o.dwellMs) ? Math.round(o.dwellMs) : undefined;
  const pogo = typeof o.pogo === "boolean" ? o.pogo : undefined;
  const sessionId = typeof o.sessionId === "string" ? o.sessionId.slice(0, 128) : null;

  const payload: Record<string, unknown> = { listingId, pos };
  if (dwellMs != null) payload.dwellMs = dwellMs;
  if (pogo != null) payload.pogo = pogo;

  const supabase = createAdminClient();
  try {
    await supabase.from("search_events").insert({
      type,
      impression_id: o.impressionId,
      session_id: sessionId,
      payload,
    });
  } catch {
    return NextResponse.json({ error: "Failed to store", code: "STORE_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
