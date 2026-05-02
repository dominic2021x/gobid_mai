/**
 * POST /api/ro/search/suggest/track
 * Telemetry for suggestion learning: impression, click, submit.
 * Strict validation, batch impressions, rate-limit by session, IP hashed server-side.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

const SESSION_RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;
const MAX_IMPRESSIONS_BATCH = 30;
const MAX_QUERY_NORM_LEN = 120;

const sessionTimestamps = new Map<string, number[]>();

function hashWithSalt(value: string, salt: string): string {
  return createHash("sha256").update(salt + value).digest("hex");
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0.0.0.0").slice(0, 45);
}

function pruneAndCheckSessionRate(sessionIdHash: string): boolean {
  const now = Date.now();
  let list = sessionTimestamps.get(sessionIdHash) ?? [];
  list = list.filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= SESSION_RATE_LIMIT) return false;
  list.push(now);
  sessionTimestamps.set(sessionIdHash, list);
  return true;
}

const EventTypeSchema = z.enum(["impression", "click", "submit"]);

const SuggestionRefSchema = z.object({
  phrase_norm: z.string().min(1).max(MAX_QUERY_NORM_LEN).transform((s) => s.trim()),
  kind: z.string().min(1).max(32),
});

const TrackBodySchema = z.object({
  event_type: EventTypeSchema,
  query_norm: z.string().min(2).max(MAX_QUERY_NORM_LEN).transform((s) => s.trim()),
  /** For impression: list of suggestions shown. For click/submit: single suggestion. */
  suggestions: z.array(SuggestionRefSchema).max(MAX_IMPRESSIONS_BATCH).optional(),
  /** For click/submit: the selected suggestion. */
  phrase_norm: z.string().min(1).max(MAX_QUERY_NORM_LEN).transform((s) => s.trim()).optional(),
  kind: z.string().min(1).max(32).optional(),
  session_id: z.string().max(128).optional(),
  channel: z.string().max(64).optional().nullable(),
}).refine(
  (data) =>
    data.event_type !== "impression" || (data.suggestions && data.suggestions.length > 0),
  { message: "impression requires suggestions array", path: ["suggestions"] }
);

type TrackBody = z.infer<typeof TrackBodySchema>;

async function resolveSuggestionId(
  supabase: ReturnType<typeof createAdminClient>,
  phraseNorm: string,
  kind: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("search_suggestions")
    .select("id")
    .eq("phrase_norm", phraseNorm)
    .eq("kind", kind)
    .eq("is_public", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = TrackBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { event_type, query_norm, suggestions, phrase_norm, kind, session_id, channel } = parsed.data;

  const salt = process.env.IP_HASH_SALT ?? "suggest-track";
  const ip = getClientIp(req);
  const ipHash = hashWithSalt(ip, salt);
  const sessionIdHash = session_id ? hashWithSalt(session_id.slice(0, 128), salt) : null;

  if (sessionIdHash && !pruneAndCheckSessionRate(sessionIdHash)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const supabase = createAdminClient();

  if (event_type === "impression") {
    const list = suggestions ?? [];
    if (list.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }
    const toInsert: Array<{ suggestion_id: string | null; query_norm: string; event_type: string; session_id_hash: string | null; ip_hash: string; channel: string | null }> = [];
    for (const ref of list) {
      const suggestionId = await resolveSuggestionId(supabase, ref.phrase_norm, ref.kind);
      toInsert.push({
        suggestion_id: suggestionId,
        query_norm: query_norm.slice(0, MAX_QUERY_NORM_LEN),
        event_type: "impression",
        session_id_hash: sessionIdHash,
        ip_hash: ipHash,
        channel: channel ?? null,
      });
    }
    if (toInsert.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }
    const { error: insertError } = await supabase.from("search_suggestion_events").insert(toInsert);
    if (insertError) {
      console.warn("[suggest/track] impression insert error:", insertError.message);
      return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: toInsert.length });
  }

  const singlePhrase = phrase_norm ?? (suggestions?.[0]?.phrase_norm);
  const singleKind = kind ?? (suggestions?.[0]?.kind);
  if (!singlePhrase || !singleKind) {
    return NextResponse.json(
      { ok: false, error: "click/submit require phrase_norm and kind (or single suggestion)" },
      { status: 400 }
    );
  }

  const suggestionId = await resolveSuggestionId(supabase, singlePhrase, singleKind);
  const { error: insertError } = await supabase.from("search_suggestion_events").insert({
    suggestion_id: suggestionId,
    query_norm: query_norm.slice(0, MAX_QUERY_NORM_LEN),
    event_type,
    session_id_hash: sessionIdHash,
    ip_hash: ipHash,
    channel: channel ?? null,
  });
  if (insertError) {
    console.warn("[suggest/track] event insert error:", insertError.message);
    return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: 1 });
}
