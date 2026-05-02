import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { ORCHESTRATOR_INSTRUCTIONS } from "@/lib/ai/searchOrchestrator/prompt";
import { orchestratorJsonSchema } from "@/lib/ai/searchOrchestrator/schema";
import { SearchOrchestratorPlanSchema } from "@/lib/ai/searchOrchestrator/schema";
import { buildListingsQueryString } from "@/lib/ai/searchOrchestrator/plan";
import {
  sanitizeProposedFilters,
  sanitizeStepListingsQuery,
} from "@/lib/ai/searchOrchestrator/sanitize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const runtime = "nodejs";
export const maxDuration = 20;

const OPENAI_TIMEOUT_MS = 8000;
const DEBUG = process.env.DEBUG_SEARCH_ORCHESTRATOR === "1";

const client = new OpenAI({ apiKey: OPENAI_SDK_API_KEY });

type MinimalPlanInput = { q: string; limit: number; sort?: string };

function minimalPlan(input: MinimalPlanInput): {
  normalizedQuery: string;
  proposedFilters: Record<string, unknown>;
  steps: Array<{ id: string; reason: string; listingsQuery: string }>;
  uiHints: { showRelaxNotice: boolean; noticeText?: string };
} {
  const normalizedQuery = input.q.trim().replace(/\s+/g, " ");
  const proposedFilters = sanitizeProposedFilters({ sort: input.sort ?? "newest" }) as Record<string, unknown>;
  const qs = buildListingsQueryString({
    q: normalizedQuery,
    filters: proposedFilters,
    from: 0,
    limit: input.limit,
  });
  return {
    normalizedQuery,
    proposedFilters,
    steps: [
      {
        id: "strict",
        reason: "Plan minim (fallback).",
        listingsQuery: `/api/ro/listings?${qs}`,
      },
    ],
    uiHints: { showRelaxNotice: false },
  };
}

function applySanitizer(
  plan: {
    normalizedQuery: string;
    proposedFilters: Record<string, unknown>;
    steps: Array<{ id: string; reason: string; listingsQuery: string }>;
  },
  limitNum: number
): void {
  plan.proposedFilters = sanitizeProposedFilters(plan.proposedFilters) as Record<string, unknown>;
  plan.steps = plan.steps.map((s) => ({
    ...s,
    listingsQuery: sanitizeStepListingsQuery(s.listingsQuery, plan.normalizedQuery, limitNum),
  }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.q !== "string") {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const q = String(body.q);
  const limitNum =
    typeof body.limit === "number"
      ? Math.max(1, Math.min(100, Math.floor(body.limit)))
      : 18;
  const sort = typeof body.sort === "string" ? body.sort : "newest";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY not configured" },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let planRaw: unknown;

  try {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ORCHESTRATOR_INSTRUCTIONS },
          {
            role: "user",
            content: `Generează planul JSON pentru căutare. Input: ${JSON.stringify({
              q,
              filters: body.filters ?? {},
              sort,
              limit: limitNum,
            })}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: orchestratorJsonSchema.name,
            strict: orchestratorJsonSchema.strict,
            schema: orchestratorJsonSchema.schema,
          },
        },
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    planRaw = raw ? JSON.parse(raw) : null;
  } catch (e: unknown) {
    const isAbort =
      typeof e === "object" &&
      e !== null &&
      "name" in e &&
      (e as { name: string }).name === "AbortError";

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log("[search-orchestrator] error", {
        qLength: q.length,
        limit: limitNum,
        abort: isAbort,
      });
    }

    clearTimeout(t);
    const plan = minimalPlan({ q, limit: limitNum, sort });
    applySanitizer(plan, limitNum);
    return NextResponse.json({ success: true, plan }, { status: 200 });
  } finally {
    clearTimeout(t);
  }

  const parsed = SearchOrchestratorPlanSchema.safeParse(planRaw);
  const plan = parsed.success
    ? (parsed.data as {
        normalizedQuery: string;
        proposedFilters: Record<string, unknown>;
        steps: Array<{ id: string; reason: string; listingsQuery: string }>;
        uiHints: { showRelaxNotice: boolean; noticeText?: string };
      })
    : minimalPlan({ q, limit: limitNum, sort });

  applySanitizer(plan, limitNum);

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[search-orchestrator] ok", {
      qLength: plan.normalizedQuery.length,
      limit: limitNum,
      stepsCount: plan.steps.length,
    });
  }

  return NextResponse.json({ success: true, plan }, { status: 200 });
}
