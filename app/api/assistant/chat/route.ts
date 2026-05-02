import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { NextRequest, NextResponse } from "next/server";
import { getAssistantAuth } from "@/lib/auth/getAssistantAuth";

loadEnvConfig(process.cwd());
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getClientIp, rateLimitOrThrow, RateLimitError } from "@/lib/security/rateLimit";
import {
  createDraftListing,
  updateDraftField,
  updateDraftFieldsBatch,
  validateDraft,
  publishDraft,
  attachPhoto,
  deleteDraft,
} from "@/lib/assistant/tools";
import type { AssistantContext } from "@/lib/assistant/tools";
import { MANDATORY_FIELDS_FOR_PUBLISH } from "@/lib/assistant/tools";
import { runAssistantTurn } from "@/lib/assistant/orchestrator";
import type { WizardState } from "@/lib/assistant/wizard/stateMachine";
import { userWantsToPublish, detectIntent, getNextWizardStep } from "@/lib/assistant/wizard/stateMachine";
import { extractFields, extractForField, getExtractedFieldEntries } from "@/lib/assistant/wizard/extractFields";
import { formatFilledFieldsReceipt } from "@/lib/assistant/wizard/fieldLabels";
import { validationMessageForField, getQuickRepliesForField } from "@/lib/assistant/wizard/fieldValidationMessages";
import { buildCompactSummary } from "@/lib/assistant/summarize";
import { runNlg, type ReplyPlan } from "@/lib/assistant/nlg";
import {
  assistantLlmKindUsesRemoteTroubleshoot,
  getAssistantLlmKind,
  getLlmProvider,
  isAssistantLlmUnreachableError,
} from "@/lib/assistant/llm";
import type { ChatMessage } from "@/lib/assistant/llm";
import { detectIntentRoute } from "@/lib/assistant/intentRouter";
import type { AssistantUiAction } from "@/lib/assistant/intentRouter";
import { RO_ONBOARDING_FRIEND_SYSTEM } from "@/lib/assistant/prompts/roOnboardingFriend";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

function getTodayDateBucharest(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Bucharest" });
}

/** First-run onboarding: friendly intro, capabilities, one question. No tools, no field collection. */
async function runOnboarding(userMessage: string, userName: string | null): Promise<string | null> {
  try {
    const llm = getLlmProvider();
    const result = await llm.complete({
      messages: [
        { role: "system", content: RO_ONBOARDING_FRIEND_SYSTEM },
        { role: "user", content: userMessage },
      ],
      max_tokens: 220,
    });
    const text = result.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EXTERNAL_AI_UNREACHABLE")) {
      throw err;
    }
    return null;
  }
}

const RATE_LIMIT_SEC = 2;
const DAILY_QUOTA = 200;
const CONTEXT_LAST_MESSAGES = 10;
const SUMMARIZE_EVERY = 20;

/** Returned when LLM times out or errors; no 500. */
const LLM_FALLBACK_REPLY =
  "Nu am putut procesa mesajul acum. Poți reformula sau spune ce ai nevoie (meniu, creare anunț).";

function getExternalAiUserMessage(): string {
  const url =
    process.env.MAC_MINI_API_URL?.trim() ||
    process.env.EXTERNAL_AI_API_URL?.trim() ||
    "EXTERNAL_AI_API_URL sau MAC_MINI_API_URL";
  return `Asistentul nu poate ajunge la serverul AI (URL efectiv: ${url}). Verifică pe Vercel + local: MAC_MINI_API_URL sau EXTERNAL_AI_API_URL (…/api/generate sau …/api/chat). Dacă Ollama e fără parolă, scoate MAC_MINI_API_KEY sau pune ASSISTANT_EXTERNAL_AI_SEND_AUTH=false. Model: ollama pull pentru gemma/mistral/llama folosite. Rețea: de pe Vercel trebuie IP:port publice (VPS bridge); vezi deploy/TAILSCALE-VPS-MACMINI-BRIDGE.md.`;
}

function remoteLlmFailureReply(): string {
  if (getAssistantLlmKind() === "external") return getExternalAiUserMessage();
  return "Serviciul AI (OpenAI) nu răspunde. Verifică OPENAI_API_KEY și limitele contului.";
}

function remoteLlmFailureFromCatch(err: unknown): boolean {
  if (!assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind())) return false;
  const s = String(err);
  return (
    s.includes("EXTERNAL_AI") ||
    s.includes("fetch") ||
    s.includes("ECONNREFUSED") ||
    s.includes("abort")
  );
}

const ASK_NAME_MESSAGE = "Cum te pot striga? Vreau să fie personal pentru tine 🙂";

const SYSTEM_PROMPT_CONVERSATIONAL = `Ești GO AI, asistentul și cel mai bun prieten al utilizatorului pe gobid.ro. Răspunzi exclusiv în limba română.

PRIORITATE 1 – PRIETENIA:
- Când utilizatorul te salută, întreabă ce faci, cum ești sau face small talk: răspunde ÎNTÂI ca un prieten adevărat. Întreabă cum îi merge, dacă are o zi bună, spune o glumă scurtă sau un răspuns cald. NU sari direct la anunțuri sau la cereri de câmpuri.
- Fii cald, amuzant (glume ușoare, potrivite), empatic. Poți folosi emoji discret. Vrei să se simtă bine vorbind cu tine.
- După ce răspunzi prietenos, poți adăuga o singură propoziție scurtă despre anunț (ex: „Când vrei, putem continua cu anunțul.”), fără să ceri imediat titlul sau alt câmp.

PRIORITATE 2 – SARCINA:
- Răspunsuri scurte: 1–4 propoziții. Nu pretinde niciodată că ai executat o acțiune decât dacă backend-ul a confirmat-o.
- Poți personaliza cu numele utilizatorului când ți se dă în context (folosește-l natural, nu forțat).`;

const LLM_MAX_CONVERSATION_MESSAGES = 8;
const LLM_MAX_MESSAGE_CHARS = 2_000;
const LLM_MAX_TOTAL_CHARS = 12_000;

function clampMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];
  const [system, ...rest] = messages;
  const lastN = rest.slice(-LLM_MAX_CONVERSATION_MESSAGES).map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content.length > LLM_MAX_MESSAGE_CHARS ? m.content.slice(0, LLM_MAX_MESSAGE_CHARS) : m.content,
  }));
  const systemLen = system?.content?.length ?? 0;
  const cap = LLM_MAX_TOTAL_CHARS - systemLen;
  const total = lastN.reduce((acc, m) => acc + m.content.length, 0);
  if (total <= cap && system) return [system, ...lastN];
  if (total <= cap) return lastN;
  const taken: ChatMessage[] = [];
  let remaining = cap;
  for (let i = lastN.length - 1; i >= 0 && remaining > 0; i--) {
    const m = lastN[i];
    const take = Math.min(m.content.length, remaining);
    taken.unshift({ role: m.role, content: take >= m.content.length ? m.content : m.content.slice(-take) });
    remaining -= take;
  }
  return system ? [system, ...taken] : taken;
}

function isGenericGreeting(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.includes("cu ce te pot ajuta") ||
    (t.includes("sunt go ai") && t.includes("spune-mi ce ai nevoie"))
  );
}

/** Intent clar de listare: vând/cumpăr, preț, mp, mașină etc. – skip onboarding lung, intră direct în flow. */
function hasListingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 200) return false;
  const listing = [
    /\b(vând|vinz|cumpăr|cumpar|închiriez|inchiriez|dau\s+în\s+chir)\b/i,
    /\b(preț|pret|lei|eur|euro|ron)\b/i,
    /\b(mp|m²|metri\s+pătrați|suprafață)\b/i,
    /\b(mașină|masina|autoturism|bmw|audi|dacia|volkswagen)\b/i,
    /\b(titlu|descriere|categorie|subcategorie)\s*[:=]/i,
    /\b(anunț|anunt)\s+(nou|despre)\b/i,
  ];
  return listing.some((re) => re.test(t));
}

/** Mesaj de salut sau small talk – trimitem la LLM pentru răspuns prietenos, nu cerem câmp. */
function isGreetingOrSmallTalk(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 120) return false;
  const greetings = [
    /^salut\s*[!.,]?\s*(ce\s+faci)?\s*[?.]?$/i,
    /^bun[ăa]\s*[!.]?$/i,
    /^hey\s*[!.]?$/i,
    /^hi\s*[!.]?$/i,
    /^hello\s*[!.]?$/i,
    /^ce\s+faci\s*[?.]?$/i,
    /^cum\s+ești\s*[?.]?$/i,
    /^cum\s+îți\s+merge\s*[?.]?$/i,
    /^cum\s+merge\s*[?.]?$/i,
    /ai\s+o\s+zi\s+bună\s*[?.]?$/i,
    /^(ce mai faci|ce mai ești)\s*[?.]?$/i,
    /^(hai\s+)?salut\b/i,
    /^(hei\s|hei,)\s*/i,
    /^(salut,?\s*)?ce faci\b/i,
  ];
  return greetings.some((re) => re.test(t));
}

/** Întreaga rută (auth + RAG + LLM + DB). 5 min pentru răspunsuri lungi. */
const ROUTE_TIMEOUT_MS = 5 * 60 * 1000; // 300_000

function withCorrelationId<T>(body: T, init?: { status?: number }, cId?: string): NextResponse {
  const res = NextResponse.json(body, init);
  if (cId) res.headers.set("x-correlation-id", cId);
  return res;
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  let convId: string | undefined;
  try {
    const timeoutPromise = new Promise<NextResponse>((resolve) => {
      setTimeout(() => {
        resolve(
          withCorrelationId(
            {
              conversationId: convId,
              message: "Nu am putut răspunde acum. Încearcă din nou în câteva secunde.",
              ...(process.env.NODE_ENV === "development"
                ? { devHint: "Timeout (ruta a depășit 5 min). LLM sau RAG pot fi lente." }
                : {}),
            },
            undefined,
            correlationId
          )
        );
      }, ROUTE_TIMEOUT_MS);
    });
    return await Promise.race([postHandler(request, correlationId), timeoutPromise]);
  } catch (outerErr) {
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    const errStack = outerErr instanceof Error ? outerErr.stack : undefined;
    if (process.env.NODE_ENV === "development") {
      console.error("[CHAT][ERROR]", correlationId, errMsg);
    }
    return withCorrelationId(
      {
        conversationId: typeof convId === "string" ? convId : undefined,
        message: "Nu am putut răspunde acum. Încearcă din nou în câteva secunde.",
        ...(process.env.NODE_ENV === "development" && errMsg
          ? { devError: errMsg.slice(0, 300) + (errMsg.length > 300 ? "…" : "") }
          : {}),
      },
      { status: 200 },
      correlationId
    );
  }
}

async function postHandler(request: NextRequest, correlationId: string): Promise<NextResponse> {
  try {
    const auth = await getAssistantAuth(request);
    if (!auth) {
      if (process.env.NODE_ENV === "development") {
        console.log("[CHAT][AUTH_FAIL]");
      }
      return withCorrelationId(
        { error: "Necesită autentificare.", code: "AUTH_REQUIRED" },
        { status: 401 },
        correlationId
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[CHAT][AUTH_OK]", "userId=" + auth.userId);
    }

    const ip = getClientIp(request);
    try {
      await rateLimitOrThrow({
        key: `chat:web:${auth.userId}:${ip}`,
        limit: 30,
        windowSeconds: 60,
      });
    } catch (e) {
      if (e instanceof RateLimitError) {
        return withCorrelationId(
          { error: e.message, code: "RATE_LIMIT_EXCEEDED" },
          { status: 429 },
          correlationId
        );
      }
      throw e;
    }

    return runChatHandler(request, auth, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare la procesare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[CHAT][ERROR]", correlationId, msg);
    }
    const isRemoteLlmCatch = remoteLlmFailureFromCatch(err);
    const message = isRemoteLlmCatch
      ? remoteLlmFailureReply()
      : "Nu am putut răspunde acum. Încearcă din nou în câteva secunde.";
    return withCorrelationId(
      {
        conversationId: undefined,
        message,
        ...(isRemoteLlmCatch
          ? { assistantErrorDetail: msg.slice(0, 400) }
          : process.env.NODE_ENV === "development"
            ? { devError: msg }
            : {}),
      },
      { status: 200 },
      correlationId
    );
  }
}

export type ChatAuth = { userId: string; accessToken: string; email: string | null };

export async function runChatHandler(
  request: NextRequest,
  auth: ChatAuth,
  correlationId: string
): Promise<NextResponse> {
  const _devT0 = process.env.NODE_ENV === "development" ? Date.now() : 0;
  let convId: string | undefined;
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("[CHAT][START]", "correlationId=" + correlationId, "ts=" + new Date().toISOString());
    }
    const body = await request.json().catch(() => ({}));
    const conversationId = body.conversationId as string | undefined;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return withCorrelationId({ error: "Lipsește mesajul." }, { status: 400 }, correlationId);
    }

    const providerName = process.env.ASSISTANT_LLM_PROVIDER ?? "(nesetat)";
    const actualProvider = getAssistantLlmKind();
    const modelName =
      actualProvider === "external"
        ? "(Mac mini / gemma|deepseek)"
        : process.env.OPENAI_MODEL ?? process.env.ASSISTANT_OPENAI_MODEL ?? "(default)";
    const baseUrlUsed =
      actualProvider === "external"
        ? process.env.MAC_MINI_API_URL?.trim() ||
          process.env.EXTERNAL_AI_API_URL?.trim() ||
          "n/a"
        : "openai";
    if (process.env.NODE_ENV === "development") {
      console.log("[CHAT][PROVIDER=" + actualProvider + "]", "model=" + modelName, "baseUrl=" + baseUrlUsed);
    }

    const supabaseUser = createServerUserClient(auth.accessToken);
    const ctx: AssistantContext = { supabase: supabaseUser, userId: auth.userId };

    const { data: userLimitRow } = await supabaseUser
      .from("assistant_user_rate_limit")
      .select("last_request_at")
      .eq("user_id", auth.userId)
      .maybeSingle();
    const userLastAt = userLimitRow?.last_request_at ? new Date(userLimitRow.last_request_at).getTime() : 0;
    if (Date.now() - userLastAt < RATE_LIMIT_SEC * 1000) {
      return withCorrelationId(
        { error: "Te rugăm să aștepți câteva secunde înainte de a trimite din nou." },
        { status: 429 },
        correlationId
      );
    }
    await supabaseUser
      .from("assistant_user_rate_limit")
      .upsert(
        { user_id: auth.userId, last_request_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    convId = conversationId;
    let draftProductId: string | null = null;
    let wizardState: WizardState = "START";
    let conversationSummary: string | null = null;
    let lastSummarizedMessageId: string | null = null;
    let lastRequestedField: string | null = null;
    let hasIntroducedFromRow = false;

    const today = getTodayDateBucharest();
    const { data: usageRow } = await supabaseUser
      .from("assistant_daily_usage")
      .select("message_count, publish_count")
      .eq("user_id", auth.userId)
      .eq("usage_date", today)
      .maybeSingle();
    const dailyCount = usageRow?.message_count ?? 0;
    const dailyPublishCount = (usageRow as { publish_count?: number } | null)?.publish_count ?? 0;
    if (dailyCount >= DAILY_QUOTA) {
      return withCorrelationId(
        { error: `Ai atins limita zilnică (${DAILY_QUOTA} mesaje). Încearcă mâine.` },
        { status: 429 },
        correlationId
      );
    }

    if (convId) {
      const { data: conv } = await supabaseUser
        .from("assistant_conversations")
        .select("id")
        .eq("id", convId)
        .eq("user_id", auth.userId)
        .single();
      if (!conv) {
        return withCorrelationId({ error: "Conversație negăsită." }, { status: 404 }, correlationId);
      }
      const { data: stateRow } = await supabaseUser
        .from("assistant_state")
        .select("draft_product_id, state, last_request_at, summary, last_summarized_message_id, data, has_introduced")
        .eq("conversation_id", convId)
        .maybeSingle();
      if (stateRow) {
        draftProductId = stateRow.draft_product_id ?? null;
        wizardState = (stateRow.state as WizardState) || "START";
        if (draftProductId && wizardState !== "PUBLISHED" && wizardState !== "DONE") {
          wizardState = "COLLECTING_DETAILS";
        }
        conversationSummary = (stateRow as { summary?: string | null }).summary ?? null;
        lastSummarizedMessageId = (stateRow as { last_summarized_message_id?: string | null }).last_summarized_message_id ?? null;
        const lastAt = stateRow.last_request_at ? new Date(stateRow.last_request_at).getTime() : 0;
        if (Date.now() - lastAt < RATE_LIMIT_SEC * 1000) {
          return withCorrelationId(
            { error: "Te rugăm să aștepți câteva secunde înainte de a trimite din nou." },
            { status: 429 },
            correlationId
          );
        }
        lastRequestedField = (stateRow as { data?: { last_requested_field?: string } }).data?.last_requested_field ?? null;
        hasIntroducedFromRow = (stateRow as { has_introduced?: boolean }).has_introduced === true;
      }
    } else {
      const { data: newConv, error: createErr } = await supabaseUser
        .from("assistant_conversations")
        .insert({ user_id: auth.userId, title: "Conversație nouă" })
        .select("id")
        .single();
      if (createErr || !newConv?.id) {
        return withCorrelationId({ error: "Nu s-a putut crea conversația." }, { status: 500 }, correlationId);
      }
      convId = newConv.id;
      await supabaseUser.from("assistant_state").insert({
        conversation_id: convId,
        state: "START",
        data: {},
      });
    }

    if (!convId) {
      return withCorrelationId({ error: "Eroare conversație." }, { status: 500 }, correlationId);
    }

    await supabaseUser.from("assistant_messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });

    await supabaseUser.from("assistant_daily_usage").upsert(
      {
        user_id: auth.userId,
        usage_date: today,
        message_count: dailyCount + 1,
      },
      { onConflict: "user_id,usage_date" }
    );

    await supabaseUser
      .from("assistant_state")
      .update({
        last_request_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("conversation_id", convId);

    const { data: profileRow } = await supabaseUser
      .from("user_profiles")
      .select("first_name, city")
      .eq("user_id", auth.userId)
      .maybeSingle();
    const userName = (profileRow?.first_name ?? "").trim() || null;
    const userCity = (profileRow as { city?: string | null } | undefined)?.city?.trim() || null;

    if (!userName) {
      const askReply = ASK_NAME_MESSAGE;
      await supabaseUser.from("assistant_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: askReply,
      });
      return withCorrelationId(
        {
          conversationId: convId,
          message: askReply,
          uiAction: { type: "OPEN_MODAL" as const, payload: { modal: "set_name" } } satisfies AssistantUiAction,
        },
        undefined,
        correlationId
      );
    }

    const { data: stateRowForData } = await supabaseUser
      .from("assistant_state")
      .select("data")
      .eq("conversation_id", convId)
      .maybeSingle();
    const stateDataRaw = (stateRowForData as { data?: Record<string, unknown> } | undefined)?.data;
    let stateData: {
      last_requested_field?: string | null;
      has_introduced?: boolean;
      publish_confirmed_at?: string | null;
    } =
      stateDataRaw && typeof stateDataRaw === "object" && !Array.isArray(stateDataRaw)
        ? {
            last_requested_field: stateDataRaw.last_requested_field as string | null | undefined,
            has_introduced: stateDataRaw.has_introduced as boolean | undefined,
            publish_confirmed_at: stateDataRaw.publish_confirmed_at as string | null | undefined,
          }
        : {};
    const hasIntroduced = hasIntroducedFromRow || stateData.has_introduced === true;
    let currentHasIntroduced = hasIntroduced;

    if (!hasIntroduced && hasListingIntent(message)) {
      currentHasIntroduced = true;
      try {
        await supabaseUser
          .from("assistant_state")
          .update({
            has_introduced: true,
            data: { ...stateData, has_introduced: true },
            updated_at: new Date().toISOString(),
          })
          .eq("conversation_id", convId);
      } catch {
        // ignore
      }
    } else if (!hasIntroduced) {
      const ONBOARDING_TIMEOUT_MS = 8_000;
      if (process.env.NODE_ENV === "development") {
        console.log("[assistant/chat] onboarding...");
      }
      try {
        const _onbT0 = process.env.NODE_ENV === "development" ? Date.now() : 0;
        const onboardingReply = await Promise.race([
          runOnboarding(message, userName),
          new Promise<string | null>((_, rej) =>
            setTimeout(() => rej(new Error("Onboarding timeout")), ONBOARDING_TIMEOUT_MS)
          ),
        ]);
        if (process.env.NODE_ENV === "development") {
          console.log("[assistant/chat] onboarding done", Date.now() - _onbT0, "ms", { ok: !!onboardingReply });
        }
        if (onboardingReply) {
          await supabaseUser.from("assistant_messages").insert({
            conversation_id: convId,
            role: "assistant",
            content: onboardingReply,
          });
          currentHasIntroduced = true;
          try {
            await supabaseUser
              .from("assistant_state")
              .update({
                has_introduced: true,
                data: { ...stateData, has_introduced: true },
                updated_at: new Date().toISOString(),
              })
              .eq("conversation_id", convId);
          } catch {
            // ignore
          }
          return withCorrelationId(
            { conversationId: convId, message: onboardingReply },
            undefined,
            correlationId
          );
        }
      } catch {
        // Onboarding failed (e.g. LLM timeout) – fall through to normal flow
      }
    }

    let reply = "";
    let newState = wizardState;
    let newDraftId = draftProductId;
    let newLastRequestedField: string | null = null;
    let quickReplies: string[] | undefined = undefined;
    let publishedThisTurn = false;
    let publishedProductId: string | null = null;
    let usedDeterministicReply = false;
    let uiAction: AssistantUiAction | undefined = undefined;
    let assistantEvents: { event_type: string; payload: Record<string, unknown> }[] = [];
    let llmRemoteFailed = false;
    let assistantErrorDetail: string | null = null;

    const routeIntent = detectIntentRoute(message);

    if (routeIntent === "open_support") {
      reply = "Deschid imediat chatul de suport pentru tine.";
      uiAction = { type: "OPEN_SUPPORT_CHAT" };
      usedDeterministicReply = true;
    } else if (routeIntent === "open_dashboard_favorites") {
      reply = "Te duc la favoritele tale.";
      uiAction = { type: "NAVIGATE", payload: { href: "/dashboard/favorites" } };
      usedDeterministicReply = true;
    } else if (routeIntent === "open_dashboard_profile") {
      reply = "Te duc la setări.";
      uiAction = { type: "NAVIGATE", payload: { href: "/dashboard/settings" } };
      usedDeterministicReply = true;
    } else if (routeIntent === "go_to_dashboard") {
      reply = "Te duc la dashboard.";
      uiAction = { type: "NAVIGATE", payload: { href: "/dashboard" } };
      usedDeterministicReply = true;
    }

    if (!reply) {
      try {
        if (userWantsToPublish(message)) {
          stateData = { ...stateData, publish_confirmed_at: new Date().toISOString() };
          await supabaseUser
            .from("assistant_state")
            .update({
              data: { ...stateData, publish_confirmed_at: new Date().toISOString() },
              updated_at: new Date().toISOString(),
            })
            .eq("conversation_id", convId);
        }
        const _t1 = process.env.NODE_ENV === "development" ? Date.now() : 0;
        const hist = await loadRecentMessages(supabaseUser, convId, CONTEXT_LAST_MESSAGES);
        if (process.env.NODE_ENV === "development") {
          console.log("[assistant/chat] timings loadMessages", Date.now() - _t1, "ms");
        }
        let ragContext: string | null = null;
        const _t2 = process.env.NODE_ENV === "development" ? Date.now() : 0;
        const RAG_TIMEOUT_MS = 6_000;
        try {
          const { retrieveContext, buildContext } = await import("@/lib/ai/rag-pinecone");
          const results = await Promise.race([
            retrieveContext(message.slice(0, 200), undefined, 4),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("RAG timeout")), RAG_TIMEOUT_MS)),
          ]);
          if (results?.length) ragContext = buildContext(results);
        } catch (ragErr) {
          if (process.env.NODE_ENV === "development" && ragErr instanceof Error && ragErr.message === "RAG timeout") {
            console.warn("[assistant/chat] RAG a depășit", RAG_TIMEOUT_MS, "ms, continuăm fără context.");
          }
        }
        if (process.env.NODE_ENV === "development") {
          console.log("[assistant/chat] timings RAG", Date.now() - _t2, "ms");
        }
        let weatherSummary: string | null = null;
        if (userCity) {
          try {
            const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
            const isSelf = /localhost|127\.0\.0\.1/.test(base);
            if (!isSelf) {
              const weatherRes = await fetch(`${base}/api/assistant/weather?city=${encodeURIComponent(userCity)}`, {
                signal: AbortSignal.timeout(3000),
              });
              if (weatherRes.ok) {
                const w = (await weatherRes.json()) as { summary?: string };
                if (w.summary) weatherSummary = w.summary;
              }
            }
          } catch {
            // weather optional
          }
        }
        let dailySupportTicketCount = 0;
        try {
          const { count: supportTicketCount } = await supabaseUser
            .from("support_tickets")
            .select("id", { count: "exact", head: true })
            .eq("user_id", auth.userId)
            .gte("created_at", `${today}T00:00:00.000Z`);
          dailySupportTicketCount = Math.min(supportTicketCount ?? 0, 999);
        } catch {
          // support_tickets table might not exist; continue with 0
        }
        if (process.env.NODE_ENV === "development") {
          console.log(
            "[assistant/chat] calling runAssistantTurn (provider:",
            getAssistantLlmKind(),
            ")"
          );
        }
        const _t3 = process.env.NODE_ENV === "development" ? Date.now() : 0;
        const turnResult = await runAssistantTurn({
          conversationId: convId,
          userId: auth.userId,
          supabase: supabaseUser,
          userMessage: message,
          recentMessages: hist,
          draftProductId,
          wizardState,
          stateData: {
            publish_confirmed_at: stateData.publish_confirmed_at ?? null,
            last_requested_field: lastRequestedField,
          },
          dailyPublishCount,
          userName,
          ragContext: ragContext ?? undefined,
          weatherSummary: weatherSummary ?? undefined,
          userEmail: auth.email ?? undefined,
          dailySupportTicketCount,
        });
        reply = turnResult.reply;
        assistantEvents = (turnResult.events ?? []) as { event_type: string; payload: Record<string, unknown> }[];
        newDraftId = turnResult.newDraftId ?? newDraftId;
        newState = turnResult.newState ?? newState;
        if (turnResult.newState === "PUBLISHED") {
          publishedThisTurn = true;
          publishedProductId = draftProductId ?? null;
        }
        quickReplies = turnResult.quickReplies ? [...turnResult.quickReplies] : undefined;
        usedDeterministicReply = true;
        if (process.env.NODE_ENV === "development") {
          console.log("[assistant/chat] timings runAssistantTurn", Date.now() - _t3, "ms | total so far", Date.now() - _devT0, "ms");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (process.env.NODE_ENV === "development") {
          console.error("[assistant/chat] runAssistantTurn error:", msg);
        }
        if (
          assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind()) &&
          isAssistantLlmUnreachableError(msg)
        ) {
          reply = "";
          llmRemoteFailed = true;
          assistantErrorDetail = msg;
        } else {
          reply = LLM_FALLBACK_REPLY;
        }
      }
    }

    if (!reply) {
    const intent = detectIntent(message);

    if (intent === "help" && !draftProductId) {
      reply =
        "Hai să-ți arăt unde e ce! 😊 Poți folosi: **Dashboard** (/dashboard), **Anunțurile mele** (/dashboard/my-products), **Favorite** (/dashboard/favorites), **Setări** (/dashboard/settings), **Token-uri** (/dashboard/tokens), **Suport** (/dashboard/support), **Licitatii** (/ro). Spune-mi ce pagină cauți și te ghidez.";
      newState = "DONE";
      usedDeterministicReply = true;
    } else if ((routeIntent === "create_listing" || intent === "create_listing") && !draftProductId) {
      const { productId } = await createDraftListing(ctx);
      newDraftId = productId;
      newState = "DRAFT_CREATED";
      reply = "Am creat draftul! Ca să publicăm anunțul, am nevoie de: titlu, descriere, categorie, subcategorie, preț și monedă. Spune-mi titlul anunțului.";
      usedDeterministicReply = true;
    } else if (draftProductId && userWantsToPublish(message)) {
      const validation = await validateDraft(ctx, draftProductId);
      if (validation.ready) {
        await publishDraft(ctx, draftProductId);
        reply =
          "Am publicat anunțul. Îl poți vedea la [Anunțurile mele](/dashboard/my-products).";
        newState = "PUBLISHED";
        publishedProductId = newDraftId;
        newDraftId = null;
        publishedThisTurn = true;
        usedDeterministicReply = true;
      } else {
        const labels = validation.missing
          .map((m) => ({ title: "Titlul", description: "Descrierea", category: "Categoria", subcategory: "Subcategoria", starting_price: "Prețul de pornire", currency: "Moneda" }[m] ?? m))
          .join(", ");
        reply = `Încă lipsesc: ${labels}. Completează-le și spune din nou „publică”.`;
        newState = "COLLECTING_DETAILS";
        usedDeterministicReply = true;
      }
    } else if (draftProductId) {
      let slotFilled = false;
      if (lastRequestedField) {
        const { data: draftRow } = await supabaseUser
          .from("products")
          .select("currency, category")
          .eq("id", newDraftId!)
          .eq("user_id", auth.userId)
          .single();
        const draftContext = {
          currency: draftRow?.currency ?? undefined,
          category: draftRow?.category ?? undefined,
        };
        const slotExtracted = extractForField(lastRequestedField, message, draftContext);
        const slotEntries = getExtractedFieldEntries(slotExtracted);
        if (slotEntries.length > 0) {
          const patch = Object.fromEntries(slotEntries.map((e) => [e.field, e.value]));
          await updateDraftFieldsBatch(ctx, newDraftId!, patch);
          const validation = await validateDraft(ctx, newDraftId!);
          const step = getNextWizardStep(newState, validation, message);
          const receipt = formatFilledFieldsReceipt(slotEntries.map((e) => e.field));
          reply = receipt ? `✅ Am completat: ${receipt}.\n\n${step.reply}` : step.reply;
          newState = step.nextState;
          newLastRequestedField = step.requestedField ?? null;
          quickReplies = getQuickRepliesForField(step.requestedField ?? "", draftRow?.category ?? undefined);
          slotFilled = true;
          usedDeterministicReply = true;
        } else if (isGreetingOrSmallTalk(message)) {
          slotFilled = false;
        } else {
          reply = validationMessageForField(lastRequestedField, { category: draftContext?.category });
          newLastRequestedField = lastRequestedField;
          quickReplies = getQuickRepliesForField(lastRequestedField, draftContext?.category);
          slotFilled = true;
          usedDeterministicReply = true;
        }
      }
      if (!slotFilled) {
      const extracted = extractFields(message);
      const entries = getExtractedFieldEntries(extracted);
      if (entries.length > 0) {
        const patch = Object.fromEntries(entries.map((e) => [e.field, e.value]));
        await updateDraftFieldsBatch(ctx, newDraftId!, patch);
        const validation = await validateDraft(ctx, newDraftId!);
        const step = getNextWizardStep(newState, validation, message);
        if (extracted.clarifyingMessage) {
          reply = extracted.clarifyingMessage;
          usedDeterministicReply = true;
        } else {
          const receipt = formatFilledFieldsReceipt(entries.map((e) => e.field));
          reply = receipt ? `✅ Am completat: ${receipt}.\n\n${step.reply}` : step.reply;
          usedDeterministicReply = true;
        }
        newState = step.nextState;
        newLastRequestedField = step.requestedField ?? null;
        if (step.requestedField === "subcategory") {
          const { data: draftCatRow } = await supabaseUser
            .from("products")
            .select("category")
            .eq("id", newDraftId!)
            .eq("user_id", auth.userId)
            .single();
          quickReplies = getQuickRepliesForField("subcategory", draftCatRow?.category ?? undefined);
        } else {
          quickReplies = getQuickRepliesForField(step.requestedField ?? "");
        }
      } else {
        newLastRequestedField = null;
        const publishIntent = userWantsToPublish(message);
        if (publishIntent) {
          const validation = await validateDraft(ctx, newDraftId!);
          const step = getNextWizardStep(newState, validation, message);
          reply = step.reply;
          newState = step.nextState;
          newLastRequestedField = step.requestedField ?? null;
          quickReplies = getQuickRepliesForField(step.requestedField ?? "", undefined);
          usedDeterministicReply = true;
        } else {
          const systemContent = buildSystemPrompt(newDraftId ?? null, newState, conversationSummary, userName);
          const hist = await loadRecentMessages(supabaseUser, convId, CONTEXT_LAST_MESSAGES);
          const chatMessages = clampMessages([
            { role: "system", content: systemContent },
            ...hist.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
            { role: "user", content: message },
          ]);
          let finalContent = "";
          try {
            if (llmRemoteFailed) {
              reply = remoteLlmFailureReply();
              const validation = await validateDraft(ctx, newDraftId!);
              const step = getNextWizardStep(newState, validation, message);
              quickReplies = getQuickRepliesForField(step.requestedField ?? "", undefined);
              usedDeterministicReply = true;
            } else {
              const llm = getLlmProvider();
              if (process.env.NODE_ENV === "development") {
                console.log("[CHAT] before provider.complete()", "correlationId=" + correlationId);
              }
              const result = await llm.complete({
                messages: chatMessages,
                metadata: { correlationId },
              });
              finalContent = result.text ?? "";
              if (process.env.NODE_ENV === "development") {
                console.log("[CHAT] after provider.complete()", "response length=" + (result.text?.length ?? 0));
              }
            }
          } catch (llmErr) {
            const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
            if (process.env.NODE_ENV === "development") {
              console.error("[assistant/chat] LLM failed (draft path):", msg);
            }
            if (
              assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind()) &&
              isAssistantLlmUnreachableError(msg)
            ) {
              assistantErrorDetail = msg;
            }
            reply =
              assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind()) &&
              isAssistantLlmUnreachableError(msg)
                ? remoteLlmFailureReply()
                : LLM_FALLBACK_REPLY;
            const validation = await validateDraft(ctx, newDraftId!);
            const step = getNextWizardStep(newState, validation, message);
            quickReplies = getQuickRepliesForField(step.requestedField ?? "", undefined);
            usedDeterministicReply = true;
          }
          if (!reply) {
            if (finalContent && !isGenericGreeting(finalContent)) {
              reply = finalContent;
            } else {
              const validation = await validateDraft(ctx, newDraftId!);
              const step = getNextWizardStep(newState, validation, message);
              reply = step.reply;
              newState = step.nextState;
              newLastRequestedField = step.requestedField ?? null;
              quickReplies = getQuickRepliesForField(step.requestedField ?? "", undefined);
              usedDeterministicReply = true;
            }
          }
        }
      }
      }
    } else {
      const systemContent = buildSystemPrompt(newDraftId ?? null, newState, conversationSummary, userName);
      const hist = await loadRecentMessages(supabaseUser, convId, CONTEXT_LAST_MESSAGES);
      const chatMessages = clampMessages([
        { role: "system", content: systemContent },
        ...hist.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: message },
      ]);
      try {
        if (llmRemoteFailed) {
          reply = remoteLlmFailureReply();
          usedDeterministicReply = true;
        } else {
          const llm = getLlmProvider();
          if (process.env.NODE_ENV === "development") {
            console.log("[CHAT] before provider.complete()", "correlationId=" + correlationId);
          }
          const result = await llm.complete({
            messages: chatMessages,
            metadata: { correlationId },
          });
          const content = result.text ?? "";
          if (process.env.NODE_ENV === "development") {
            console.log("[CHAT] after provider.complete()", "response length=" + (content?.length ?? 0));
          }
          if (content) reply = content;
          else reply = "Cu ce te pot ajuta? Sunt GO AI – pot să-ți explic meniul sau să te ghidez pas cu pas să creezi un anunț. Spune-mi ce ai nevoie!";
        }
      } catch (llmErr) {
        const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
        if (process.env.NODE_ENV === "development") {
          console.error("[assistant/chat] LLM failed (free-form path):", msg);
        }
        if (
          assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind()) &&
          isAssistantLlmUnreachableError(msg)
        ) {
          assistantErrorDetail = msg;
        }
        reply =
          assistantLlmKindUsesRemoteTroubleshoot(getAssistantLlmKind()) &&
          isAssistantLlmUnreachableError(msg)
            ? remoteLlmFailureReply()
            : LLM_FALLBACK_REPLY;
        usedDeterministicReply = true;
      }
    }
    }

    const MANDATORY_TOTAL = MANDATORY_FIELDS_FOR_PUBLISH.length;
    let draftProgress: { status: "draft" | "ready" | "published"; filled: number; total: number } | null = null;
    if (publishedThisTurn) {
      draftProgress = { status: "published", filled: MANDATORY_TOTAL, total: MANDATORY_TOTAL };
    } else if (newDraftId) {
      const validationForProgress = await validateDraft(ctx, newDraftId);
      draftProgress = {
        status: validationForProgress.ready ? "ready" : "draft",
        filled: MANDATORY_TOTAL - validationForProgress.missing.length,
        total: MANDATORY_TOTAL,
      };
    }

    if (usedDeterministicReply && reply) {
      const recentForNlg = await loadRecentMessages(supabaseUser, convId, 4);
      const plan: ReplyPlan = {
        deterministicReply: reply,
        userMessage: message,
        mode: publishedThisTurn ? "published" : newState === "INTENT_HELP" || newState === "DONE" ? "help" : "draft",
        requestedField: newLastRequestedField ?? undefined,
        quickReplies,
        progress: draftProgress ?? undefined,
      };
      const rewritten = await runNlg(plan, recentForNlg);
      if (rewritten) reply = rewritten;
    }

    await supabaseUser.from("assistant_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: reply,
    });

    let newSummary = conversationSummary;
    let newLastSummarizedId = lastSummarizedMessageId;
    const { count: totalMessages } = await supabaseUser
      .from("assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId);
    const total = totalMessages ?? 0;

    if (total === 2) {
      const generatedTitle = await generateConversationTitle(message, reply);
      if (generatedTitle) {
        await supabaseUser
          .from("assistant_conversations")
          .update({ title: generatedTitle })
          .eq("id", convId)
          .eq("user_id", auth.userId);
      }
    }

    if (total >= SUMMARIZE_EVERY) {
      const { data: toSummarize } = await supabaseUser
        .from("assistant_messages")
        .select("id, role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      const list = toSummarize ?? [];
      let startIdx = 0;
      if (lastSummarizedMessageId) {
        const idx = list.findIndex((r) => r.id === lastSummarizedMessageId);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }
      const slice = list.slice(startIdx, startIdx + SUMMARIZE_EVERY);
      if (slice.length >= SUMMARIZE_EVERY) {
        const summaryText = buildCompactSummary(
          slice.map((m) => ({ role: m.role, content: m.content ?? "" }))
        );
        const lastId = slice[slice.length - 1]?.id ?? null;
        if (summaryText && lastId) {
          newSummary = (conversationSummary ? conversationSummary + "\n" : "") + summaryText;
          newLastSummarizedId = lastId;
        }
      }
    }

    const stateDataForUpdate: Record<string, unknown> = {
      state: newState,
      draft_product_id: newDraftId ?? null,
      last_requested_field: newLastRequestedField ?? null,
      has_introduced: currentHasIntroduced,
      publish_confirmed_at: publishedThisTurn ? null : (stateData.publish_confirmed_at ?? null),
    };

    await supabaseUser
      .from("assistant_state")
      .update({
        draft_product_id: newDraftId ?? null,
        state: newState,
        has_introduced: currentHasIntroduced,
        data: stateDataForUpdate,
        summary: newSummary,
        last_summarized_message_id: newLastSummarizedId,
        updated_at: new Date().toISOString(),
      })
      .eq("conversation_id", convId);

    if (publishedThisTurn) {
      try {
        await supabaseUser
          .from("assistant_daily_usage")
          .upsert(
            {
              user_id: auth.userId,
              usage_date: today,
              message_count: dailyCount + 1,
              publish_count: dailyPublishCount + 1,
            },
            { onConflict: "user_id,usage_date" }
          );
      } catch (usageErr) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[assistant/chat] assistant_daily_usage upsert failed (table/column missing?):", usageErr);
        }
      }
      if (publishedProductId) {
        try {
          const { createAdminClient } = await import("@/lib/supabase/admin");
          await createAdminClient().from("assistant_audit_log").insert({
            user_id: auth.userId,
            action: "publish",
            resource_type: "product",
            resource_id: publishedProductId,
            payload: { conversation_id: convId },
          });
        } catch {
          // audit best-effort
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[CHAT][RESPONSE_LENGTH=" + (reply?.length ?? 0) + "]");
      console.log("[CHAT][END]");
    }
    return withCorrelationId(
      {
        conversationId: convId,
        message: reply,
        ...(quickReplies != null && quickReplies.length > 0 ? { quickReplies } : {}),
        ...(draftProgress != null ? { draftProgress } : {}),
        ...(uiAction != null ? { uiAction } : {}),
        ...(assistantEvents.length > 0 ? { assistantEvents } : {}),
        ...(assistantErrorDetail ? { assistantErrorDetail: assistantErrorDetail.slice(0, 400) } : {}),
      },
      undefined,
      correlationId
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare la procesare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[CHAT][ERROR]", correlationId, msg);
    }
    const isRemoteLlmCatch = remoteLlmFailureFromCatch(err);
    const message = isRemoteLlmCatch
      ? remoteLlmFailureReply()
      : "Nu am putut răspunde acum. Încearcă din nou în câteva secunde.";
    return withCorrelationId(
      {
        conversationId: typeof convId === "string" ? convId : undefined,
        message,
        ...(isRemoteLlmCatch
          ? { assistantErrorDetail: msg.slice(0, 400) }
          : process.env.NODE_ENV === "development"
            ? { devError: msg }
            : {}),
      },
      { status: 200 },
      correlationId
    );
  }
}

function buildSystemPrompt(
  draftProductId: string | null | undefined,
  state: WizardState,
  summary: string | null = null,
  userName: string | null = null
): string {
  const nameLine = userName ? `\nNumele utilizatorului (folosește-l natural): ${userName}.\n` : "";
  const draftInfo = draftProductId
    ? `Există DEJA un draft de anunț cu id: ${draftProductId}. NU apela NICIODATĂ createDraftListing. Folosește DOAR updateDraftField (cu acest productId), attachPhoto, validateDraft sau publishDraft. Când utilizatorul dă titlul sau descrierea, apelează updateDraftField imediat.`
    : "Nu există încă un draft. Pentru a crea unul, folosește createDraftListing (fără argumente).";
  const summaryBlock = summary?.trim()
    ? `\nRezumat conversație anterioară:\n${summary.slice(0, 800)}\n\n`
    : "";
  return `${SYSTEM_PROMPT_CONVERSATIONAL}
${nameLine}
Limite stricte:
1. Poți doar explica navigarea în dashboard și ghida crearea și PUBLICAREA unui anunț.
2. Nu ai acces admin, nu vezi date ale altor utilizatori.
3. Pentru anunțuri Executări/Insolvență doar explici că necesită token.
4. Nu inventa acțiuni (navigare, publicare etc.); menționează doar ce s-a întâmplat efectiv.

Când utilizatorul vrea să creeze/public un anunț: cere detaliile (titlu, descriere, categorie, subcategorie, preț, monedă), apoi confirmă publicarea. După publicare confirmă scurt.

IMPORTANT: Dacă ultimul mesaj al utilizatorului este un salut („Salut”, „Ce faci?”, „Cum ești?”, „Bună”), small talk sau întrebare despre el/ziua lui, răspunde PRIETENOS ÎNTÂI (glumă, întrebare cum îi merge, răspuns cald). Abia după aceea poți menționa anunțul/draftul într-o propoziție. Nu ignora salutul și nu trece direct la „Spune-mi titlul”.

${draftInfo}
Stare curentă wizard: ${state}.
${summaryBlock}Câmpuri obligatorii: title, description, category, subcategory, starting_price (> 0), currency (Lei sau EUR).`;
}

async function loadRecentMessages(
  supabase: AssistantContext["supabase"],
  conversationId: string,
  limit: number
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .neq("role", "system")
    .order("created_at", { ascending: true })
    .range(0, limit - 1);
  return (data ?? []).map((r) => ({ role: r.role as "user" | "assistant", content: r.content ?? "" }));
}

/** Generează un titlu scurt (max ~6 cuvinte) din primul schimb user + assistant, în română. */
async function generateConversationTitle(userMessage: string, assistantReply: string): Promise<string | null> {
  const text = `Utilizator: ${userMessage.slice(0, 300)}\nAsistent: ${(assistantReply || "").slice(0, 300)}`;
  try {
    const llm = getLlmProvider();
    const result = await llm.complete({
      messages: [
        {
          role: "system",
          content:
            "Ești un helper. Primești un schimb scurt de mesaje (utilizator + asistent). Răspunde DOAR cu un titlu de conversație în română, maxim 5-6 cuvinte, fără ghilimele, fără punct. Exemplu: Creare anunț iPhone.",
        },
        { role: "user", content: text },
      ],
    });
    const title = result.text?.trim();
    if (title && title.length > 0 && title.length <= 80) return title;
  } catch {
    // ignore; păstrăm "Conversație nouă"
  }
  return null;
}

/*
  Manual QA checklist:
  1. Log in, go to /dashboard/assistant. Nav shows "Asistent AI".
  2. Send "Unde găsesc favorite?" -> reply with menu / deep links.
  3. Click "Creează un anunț" or send "Vreau să public un anunț" -> draft created, reply asks for title.
  4. Send title, then category, subcategory, price, currency (e.g. "Titlu: iPhone 15", "Categoria: telefoane", "Preț 2000 Lei").
  5. Send "publică" or "da, publică" -> must confirm; after publish, reply links to /dashboard/my-products.
  6. Unauthenticated POST /api/assistant/chat -> 401.
  7. Send two messages in &lt; 2s -> second returns 429 (rate limit).
*/
