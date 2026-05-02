/**
 * POST /api/ro/search/autocorrect/track
 * Telemetry for autocorrect usefulness: shown, accepted, ignored, reformulated.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const MAX_QUERY_LEN = 120;

const sessionTimestamps = new Map<string, number[]>();

function hashWithSalt(value: string, salt: string): string {
  return createHash("sha256").update(salt + value).digest("hex");
}

function pruneAndCheckRate(sessionIdHash: string): boolean {
  const now = Date.now();
  let list = sessionTimestamps.get(sessionIdHash) ?? [];
  list = list.filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) return false;
  list.push(now);
  sessionTimestamps.set(sessionIdHash, list);
  return true;
}

const EventTypeSchema = z.enum([
  "autocorrect_shown",
  "autocorrect_accepted",
  "autocorrect_ignored",
  "autocorrect_reformulated",
]);

const BodySchema = z.object({
  event_type: EventTypeSchema,
  original_query_norm: z.string().min(2).max(MAX_QUERY_LEN).transform((s) => s.trim()),
  suggested_query_norm: z.string().max(MAX_QUERY_LEN).transform((s) => s.trim()).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  page_context: z.string().max(64).optional().nullable(),
  session_id: z.string().max(128).optional(),
  vertical: z.string().max(64).optional().nullable(),
  category_slug: z.string().max(64).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const salt = process.env.IP_HASH_SALT ?? "autocorrect-track";
  const sessionIdHash = parsed.data.session_id
    ? hashWithSalt(parsed.data.session_id.slice(0, 128), salt)
    : null;

  if (sessionIdHash && !pruneAndCheckRate(sessionIdHash)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("search_autocorrect_events").insert({
    event_type: parsed.data.event_type,
    original_query_norm: parsed.data.original_query_norm,
    suggested_query_norm: parsed.data.suggested_query_norm ?? null,
    confidence: parsed.data.confidence ?? null,
    page_context: parsed.data.page_context ?? null,
    session_id_hash: sessionIdHash,
    vertical: parsed.data.vertical ?? null,
    category_slug: parsed.data.category_slug ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
