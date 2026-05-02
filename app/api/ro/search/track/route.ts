/**
 * Public search tracking: impression, click, submit, save, contact_intent, bid_intent, scroll_depth, query_reformulation, pagination.
 * No auth. Strict validation. sendBeacon-friendly. Rate limit by IP. Optional session_id (hashed).
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isUuid,
  validateQueryNorm,
  validateResultsList,
  RATE_LIMIT_PER_MIN,
  RATE_WINDOW_MS,
  SEARCH_TELEMETRY_EVENT_TYPES,
  type SearchTelemetryEventType,
} from "@/lib/search/telemetry/validateSearchTelemetry";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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
  const ip = (xff?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0.0.0.0").slice(0, 45);
  return ip;
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
  const eventType = o.type as string;
  if (!SEARCH_TELEMETRY_EVENT_TYPES.includes(eventType as SearchTelemetryEventType)) {
    return NextResponse.json(
      { error: "type must be one of: " + SEARCH_TELEMETRY_EVENT_TYPES.join(", "), code: "INVALID_TYPE" },
      { status: 400 }
    );
  }
  const qNorm = typeof o.qNorm === "string" ? o.qNorm.trim() : "";
  if (!validateQueryNorm(qNorm)) {
    return NextResponse.json({ error: "qNorm length invalid (2-120)", code: "INVALID_Q_NORM" }, { status: 400 });
  }
  const impressionId = o.impressionId;
  const sessionId = typeof o.sessionId === "string" ? o.sessionId.slice(0, 128) : null;
  const salt = process.env.IP_HASH_SALT ?? "search-track";
  const sessionIdHash = sessionId ? createHash("sha256").update(salt + sessionId).digest("hex") : null;

  const supabase = createAdminClient();

  if (eventType === "impression") {
    if (!isUuid(impressionId)) {
      return NextResponse.json({ error: "Invalid impressionId uuid", code: "INVALID_IMPRESSION_ID" }, { status: 400 });
    }
    const bucket = typeof o.bucket === "string" ? o.bucket.slice(0, 64) : "default";
    const arm = typeof o.arm === "string" ? o.arm.slice(0, 64) : "mix_a";
    const capped = validateResultsList(o.results);

    try {
      await supabase.from("search_impressions").upsert(
        {
          impression_id: impressionId,
          q_norm: qNorm,
          intent_bucket: bucket,
          arm,
          results: capped,
        },
        { onConflict: "impression_id" }
      );
      await supabase.from("search_events").insert({
        type: "impression",
        impression_id: impressionId,
        q_norm: qNorm,
        session_id: sessionIdHash ?? sessionId,
        payload: { bucket, arm, resultsCount: capped.length },
      });
    } catch {
      return NextResponse.json({ error: "Failed to store", code: "STORE_ERROR" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const listingId = o.listingId ?? o.listing_id;
  const position = typeof o.position === "number" ? o.position : undefined;
  const payload: Record<string, unknown> = {
    eventType,
    ...(listingId ? { listingId: String(listingId).slice(0, 36) } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(o.scrollDepth !== undefined
      ? { scrollDepth: Math.min(1, Math.max(0, Number(o.scrollDepth))) }
      : {}),
    ...(o.fromQuery !== undefined ? { fromQuery: String(o.fromQuery).slice(0, 120) } : {}),
    ...(o.page !== undefined ? { page: Math.max(1, Number(o.page) || 1) } : {}),
  };

  try {
    await supabase.from("search_events").insert({
      type: eventType,
      impression_id: isUuid(impressionId) ? impressionId : null,
      q_norm: qNorm,
      session_id: sessionIdHash ?? sessionId,
      payload,
    });
  } catch {
    return NextResponse.json({ error: "Failed to store", code: "STORE_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
