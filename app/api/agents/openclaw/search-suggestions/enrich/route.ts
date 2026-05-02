/**
 * POST/GET /api/agents/openclaw/search-suggestions/enrich
 * Pipeline offline: îmbogățește sugestii de tip 'query' cu Claude (sinonime/expansiuni RO).
 * Cron-secured. Cost control: nu reîmbogățește aceeași bază mai des de 7 zile.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { anthropicMessages } from "@/lib/ai/anthropic/client";
import { normalizeRo } from "@/lib/search/roNormalize";
import { acceptEnrichedPhrase } from "@/lib/search/enrichGuards";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const ENRICH_COOLDOWN_DAYS = 7;
const BATCH_SIZE = 200;
const MODEL = "claude-3-5-sonnet-latest";
const MAX_RETRIES = 2;

const ClaudeEnrichSchema = z.object({
  base: z.string(),
  suggestions: z.array(
    z.object({
      phrase: z.string(),
      kind: z.literal("query"),
      weight: z.number().int().min(0).default(1),
    })
  ),
  synonyms: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      weight: z.number().int().min(0).default(1),
    })
  ),
});

type ClaudeEnrich = z.infer<typeof ClaudeEnrichSchema>;

const SYSTEM_PROMPT = `Ești un asistent român. Produ doar JSON valid conform schemei. Fără explicații, fără markdown, fără traduceri în engleză.
Schema răspuns (strict):
{
  "base": "string (query-ul de bază, cu diacritice corecte)",
  "suggestions": [
    { "phrase": "string", "kind": "query", "weight": 1 }
  ],
  "synonyms": [
    { "from": "string (forma normalizată fără diacritice)", "to": "string (forma cu diacritice)", "weight": 1 }
  ]
}
Reguli: doar în română; sinonime/expansiuni (ex: ap -> apartament, cam -> camere); corectare diacritice; fără traduceri.`;

function parseJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}") + 1;
  if (start === -1 || end <= start) throw new Error("No JSON object in response");
  return JSON.parse(trimmed.slice(start, end)) as unknown;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function callClaudeWithRetry(basePhrase: string): Promise<ClaudeEnrich | null> {
  const userPrompt = `Pentru query-ul de căutare românesc: "${basePhrase}"
Generează: 1) "base" = forma corectată cu diacritice; 2) "suggestions" = 2-8 variante de fraze (ex: "apartament 2 camere", "spațiu comercial"); 3) "synonyms" = perechi from_norm -> to_phrase (ex: from "ap" to "apartament", from "cam" to "camere"). Doar română, fără traduceri.`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await anthropicMessages({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      });
      const text = res.content?.find((c) => c.type === "text")?.text ?? "";
      const parsed = parseJsonFromResponse(text);
      const validated = ClaudeEnrichSchema.safeParse(parsed);
      if (!validated.success) return null;
      return validated.data;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : null;
      if (attempt < MAX_RETRIES && status !== null && isRetryableStatus(status)) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (attempt < MAX_RETRIES && msg.includes("429")) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function sevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - ENRICH_COOLDOWN_DAYS);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  return runEnrich(req);
}

export async function POST(req: NextRequest) {
  return runEnrich(req);
}

async function runEnrich(req: NextRequest) {
  try {
    await requireCronSecret(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cooldown = sevenDaysAgo();

  const { data: rows, error: fetchError } = await supabase
    .from("search_suggestions")
    .select("id, phrase, phrase_norm, popularity, meta, updated_at")
    .eq("kind", "query")
    .order("popularity", { ascending: false })
    .limit(BATCH_SIZE);

  if (fetchError || !rows?.length) {
    return NextResponse.json({
      ok: true,
      enriched: 0,
      skipped: 0,
      error: fetchError?.message ?? null,
    });
  }

  type Row = { id: string; phrase: string; phrase_norm: string; popularity: number; meta: unknown; updated_at: string };
  const toEnrich: Row[] = [];
  for (const r of rows as Row[]) {
    const meta = (r.meta as { enriched_at?: string } | null) ?? {};
    const enrichedAt = meta.enriched_at;
    if (enrichedAt && enrichedAt >= cooldown) continue;
    toEnrich.push(r);
  }

  let enriched = 0;
  let skipped = 0;

  for (const row of toEnrich.slice(0, 30)) {
    const result = await callClaudeWithRetry(row.phrase);
    if (!result) {
      skipped++;
      continue;
    }

    const baseNorm = normalizeRo(result.base);
    const basePhrase = result.base?.trim() ?? row.phrase;

    let receivedSuggestions = result.suggestions?.length ?? 0;
    let acceptedSuggestions = 0;
    let rejectedSuggestions = 0;

    if (baseNorm) {
      await supabase.from("search_suggestions").upsert(
        {
          phrase: result.base,
          phrase_norm: baseNorm,
          kind: "query",
          popularity: row.popularity ?? 0,
          meta: { ...((row.meta as object) ?? {}), enriched_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phrase_norm,kind" }
      );
    }

    for (const s of result.suggestions) {
      const phrase = s.phrase?.trim();
      if (!phrase) continue;
      if (!acceptEnrichedPhrase(basePhrase, phrase)) {
        rejectedSuggestions++;
        continue;
      }
      acceptedSuggestions++;
      const phrase_norm = normalizeRo(phrase);
      if (!phrase_norm) continue;
      await supabase.from("search_suggestions").upsert(
        {
          phrase,
          phrase_norm,
          kind: "query",
          popularity: s.weight ?? 1,
          meta: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phrase_norm,kind" }
      );
    }

    for (const syn of result.synonyms) {
      const from_norm = normalizeRo(syn.from?.trim() ?? "").trim();
      const to_phrase = (syn.to ?? "").trim();
      if (!to_phrase || !acceptEnrichedPhrase(basePhrase, to_phrase)) continue;
      const to_norm = normalizeRo(to_phrase);
      if (!from_norm || !to_norm) continue;
      await supabase.from("search_suggestion_synonyms").upsert(
        {
          from_norm,
          to_phrase,
          to_norm,
          weight: syn.weight ?? 1,
        },
        { onConflict: "from_norm,to_norm" }
      );
    }

    if (receivedSuggestions > 0 && (acceptedSuggestions > 0 || rejectedSuggestions > 0)) {
      console.info("enrich_guards", {
        received_suggestions: receivedSuggestions,
        accepted_suggestions: acceptedSuggestions,
        rejected_suggestions: rejectedSuggestions,
      });
    }

    await supabase
      .from("search_suggestions")
      .update({
        meta: { ...((row.meta as object) ?? {}), enriched_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    enriched++;
  }

  return NextResponse.json({
    ok: true,
    enriched,
    skipped,
    totalCandidates: toEnrich.length,
  });
}
