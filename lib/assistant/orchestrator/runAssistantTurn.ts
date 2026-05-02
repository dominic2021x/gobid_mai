/**
 * Friendly but limited assistant: CHAT mode (small talk, RAG, weather) vs ACTION mode (max 1 tool per turn).
 * ACTION mode forces strict JSON; server executes DB mutations with policy allowlist.
 */

import { getLlmProvider } from "@/lib/assistant/llm";
import type { ChatMessage } from "@/lib/assistant/llm";
import type { OrchestratorContext } from "./tools";
import {
  ALLOWED_ACTIONS,
  createDraftListing,
  updateDraftField,
  updateDraftFieldsBatch,
  validateDraft,
  publishDraft,
  createSupportTicket,
} from "./tools";
import type { AssistantEvent } from "./tools";
import type { WizardState } from "@/lib/assistant/wizard/stateMachine";
import { getNextWizardStep, userWantsToPublish } from "@/lib/assistant/wizard/stateMachine";
import { detectIntent } from "@/lib/assistant/wizard/stateMachine";
import type { ValidateDraftResult } from "@/lib/assistant/tools";

/** CHAT = friendly reply only (small talk, RAG, weather). ACTION = execute one allowed tool. */
export type AssistantMode = "CHAT" | "ACTION";

function getAssistantMode(message: string, draftProductId: string | null): AssistantMode {
  const t = message.trim().toLowerCase();
  const intent = detectIntent(message);
  if (intent === "create_listing" && !draftProductId) return "ACTION";
  if (draftProductId && (userWantsToPublish(message) || /\b(completează|completez|titlu|descriere|categorie|preț|monedă)\b/.test(t)))
    return "ACTION";
  if (/\b(tichet|suport|ajutor|problemă|problema)\b/.test(t) && /\b(vreau|crează|deschide|vreau să)\b/.test(t)) return "ACTION";
  return "CHAT";
}

const CHAT_SYSTEM_PROMPT = `Ești GO AI, prietenul utilizatorului pe gobid.ro. Răspunzi DOAR în limba română.
- Fii prietenos: small talk, glume ușoare, întreabă cum merge.
- Dacă te întreabă despre site (unde găsesc X, cum fac Y), folosește informațiile din context (RAG) dacă sunt date; altfel oferă link-uri utile: Dashboard (/dashboard), Anunțurile mele (/dashboard/my-products), Favorite (/dashboard/favorites), Setări (/dashboard/settings), Suport (/dashboard/support), Licitatii (/ro).
- Nu inventa acțiuni (nu crea draft, nu publica) – doar explici și ghidezi. Pentru acțiuni pe site, spune utilizatorului să folosească meniul sau chat-ul pentru comenzi clare.
- Răspuns scurt: 1-4 propoziții.`;

const SYSTEM_PROMPT = `Ești GO AI, asistentul pe gobid.ro. Răspunzi DOAR în limba română.

REGULI STRICTE:
1. Răspunsul tău trebuie să fie UN SINGUR obiect JSON, fără text înainte sau după.
2. Format: {"reply": "text scurt pentru utilizator (max 2-4 propoziții)", "action": "create_draft" | "update_field" | "validate_draft" | "publish_draft" | "none", "payload": {...}}

Acțiuni permise (una per răspuns):
- create_draft: când utilizatorul vrea să creeze un anunț și NU există deja draft. payload: {}
- update_field: când utilizatorul dă un câmp (titlu, descriere, categorie, subcategorie, preț, monedă). payload: { "productId": "uuid", "field": "title"|"description"|"category"|"subcategory"|"starting_price"|"currency", "value": "..." } (value: string sau number pentru preț)
- update_field cu mai multe câmpuri: payload: { "productId": "uuid", "patch": { "title": "...", "description": "..." } } - folosește "patch" doar când utilizatorul dă mai multe informații deodată
- validate_draft: pentru a verifica dacă draftul e gata de publicare. payload: { "productId": "uuid" }
- publish_draft: DOAR când utilizatorul a spus explicit "da, publică" sau "publică" și draftul e valid. payload: { "productId": "uuid" }
- create_support_ticket: când utilizatorul cere explicit un tichet de suport. payload: { "subject": "text", "message": "text", "category": "general"|"technical"|"billing" }
- none: pentru salut, small talk, întrebări despre meniu, sau când nu e nevoie de acțiune. payload: {}

Câmpuri permise pentru update_field: title, description, category, subcategory, starting_price, currency (RON/EUR). Respinge orice alt câmp.
Nu inventa productId; folosește doar id-ul draftului curent din context.
Răspunsul "reply" trebuie să fie prietenos și concis.`;

export type RunAssistantTurnInput = {
  conversationId: string;
  userId: string;
  supabase: OrchestratorContext["supabase"];
  userMessage: string;
  recentMessages: { role: "user" | "assistant"; content: string }[];
  draftProductId: string | null;
  wizardState: WizardState;
  stateData: { publish_confirmed_at?: string | null; last_requested_field?: string | null };
  dailyPublishCount: number;
  userName: string | null;
  /** CHAT mode: RAG context for site knowledge (optional). */
  ragContext?: string | null;
  /** CHAT mode: short weather summary for user's city (optional). */
  weatherSummary?: string | null;
  /** For create_support_ticket: user email and daily ticket count. */
  userEmail?: string | null;
  dailySupportTicketCount?: number;
};

export type RunAssistantTurnResult = {
  reply: string;
  events: AssistantEvent[];
  newDraftId: string | null;
  newState: WizardState;
  validation: ValidateDraftResult | null;
  quickReplies?: string[];
  error?: string;
};

function shouldPropagateLlmFailureToChatRoute(msg: string): boolean {
  return msg.includes("EXTERNAL_AI_UNREACHABLE");
}

function extractJsonFromReply(text: string): { reply: string; action: string; payload: Record<string, unknown> } | null {
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    jsonStr = codeBlock[1].trim();
  } else if (trimmed.startsWith("{")) {
    const end = trimmed.lastIndexOf("}");
    if (end !== -1) jsonStr = trimmed.slice(0, end + 1);
  }
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const action = typeof parsed.action === "string" ? parsed.action : "none";
    const payload = parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
      ? (parsed.payload as Record<string, unknown>)
      : {};
    return { reply, action, payload };
  } catch {
    return null;
  }
}

export async function runAssistantTurn(input: RunAssistantTurnInput): Promise<RunAssistantTurnResult> {
  const {
    conversationId,
    userId,
    supabase,
    userMessage,
    recentMessages,
    draftProductId,
    wizardState,
    stateData,
    dailyPublishCount,
    userName,
    ragContext,
    weatherSummary,
    userEmail,
    dailySupportTicketCount = 0,
  } = input;

  const ctx: OrchestratorContext = { supabase, userId, conversationId };
  const events: AssistantEvent[] = [];
  let newDraftId = draftProductId;
  let newState = wizardState;
  let validation: ValidateDraftResult | null = null;
  let quickReplies: string[] | undefined;

  const mode = getAssistantMode(userMessage, draftProductId);

  if (mode === "CHAT") {
    const systemParts = [CHAT_SYSTEM_PROMPT];
    if (ragContext?.trim()) systemParts.push(`\nContext (folosește pentru răspuns):\n${ragContext.trim().slice(0, 2000)}`);
    if (weatherSummary?.trim()) systemParts.push(`\nVremea (poți menționa dacă e relevant): ${weatherSummary.trim().slice(0, 300)}`);
    if (userName) systemParts.push(`\nNume utilizator: ${userName}.`);
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemParts.join("\n") },
      ...recentMessages.slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userMessage },
    ];
    try {
      const _llmT0 = process.env.NODE_ENV === "development" ? Date.now() : 0;
      const llm = getLlmProvider();
      const result = await llm.complete({ messages: chatMessages, max_tokens: 400 });
      if (process.env.NODE_ENV === "development") {
        console.log("[runAssistantTurn] CHAT llm.complete", Date.now() - _llmT0, "ms");
      }
      const reply = result.text?.trim() || "Cu ce te pot ajuta? Spune-mi sau alege din meniu.";
      return { reply, events: [], newDraftId, newState, validation };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (shouldPropagateLlmFailureToChatRoute(msg)) throw err;
      if (process.env.NODE_ENV === "development") {
        console.error("[runAssistantTurn] CHAT llm error (generic fallback):", msg.slice(0, 500));
      }
      return {
        reply: "Nu am putut răspunde acum. Încearcă din nou sau vizitează [Suport](/dashboard/support).",
        events: [],
        newDraftId,
        newState,
        validation,
      };
    }
  }

  const nameLine = userName ? ` Nume utilizator: ${userName}.` : "";
  const draftLine = draftProductId
    ? ` Există draft cu productId: ${draftProductId}. Pentru update_field sau validate_draft sau publish_draft folosește acest id.`
    : " Nu există draft. Pentru a crea unul, folosește action: create_draft cu payload: {}.";
  const systemContent = `${SYSTEM_PROMPT}\n\nContext:${nameLine}${draftLine} Stare: ${wizardState}. Ultimul mesaj utilizator: "${userMessage.slice(0, 300)}". Răspunde DOAR cu JSON.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...recentMessages.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];

  const _llmT0 = process.env.NODE_ENV === "development" ? Date.now() : 0;
  const llm = getLlmProvider();
  const result = await llm.complete({ messages, max_tokens: 600 });
  if (process.env.NODE_ENV === "development") {
    console.log("[runAssistantTurn] ACTION llm.complete", Date.now() - _llmT0, "ms");
  }
  const rawText = result.text?.trim() ?? "";
  const parsed = extractJsonFromReply(rawText);

  if (!parsed) {
    return {
      reply: "Nu am putut interpreta răspunsul. Încearcă să reformulezi sau spune ce câmp vrei să completezi.",
      events: [],
      newDraftId,
      newState,
      validation,
      error: "invalid_json",
    };
  }

  const { reply: llmReply, action, payload } = parsed;
  const actionLower = action.toLowerCase().trim();

  if (!(ALLOWED_ACTIONS as readonly string[]).includes(actionLower)) {
    return {
      reply: llmReply || "Am înțeles. Cu ce te pot ajuta?",
      events: [],
      newDraftId,
      newState,
      validation,
    };
  }

  if (actionLower === "none") {
    return {
      reply: llmReply || "Cu ce te pot ajuta?",
      events: [],
      newDraftId,
      newState,
      validation,
    };
  }

  try {
    if (actionLower === "create_draft") {
      if (draftProductId) {
        return {
          reply: "Există deja un draft. Spune-mi titlul sau alte detalii pentru a le completa.",
          events: [],
          newDraftId,
          newState,
          validation,
        };
      }
      const { productId, event } = await createDraftListing(ctx);
      newDraftId = productId;
      newState = "DRAFT_CREATED";
      events.push(event);
      const validatedCreate = await validateDraft(ctx, productId);
      validation = { ready: validatedCreate.ready, missing: validatedCreate.missing };
      events.push(validatedCreate.event);
      const step = getNextWizardStep(newState, validation, userMessage);
      return {
        reply: llmReply || step.reply,
        events,
        newDraftId,
        newState: step.nextState,
        validation,
        quickReplies: step.requestedField ? [step.requestedField] : undefined,
      };
    }

    if (actionLower === "update_field") {
      const productId = (payload.productId ?? payload.product_id) as string | undefined;
      if (!productId || productId !== draftProductId) {
        return {
          reply: llmReply || "Spune-mi ce câmp vrei să completezi (titlu, descriere, categorie, preț, monedă).",
          events: [],
          newDraftId,
          newState,
          validation,
        };
      }
      const patch = payload.patch as Record<string, unknown> | undefined;
      if (patch && typeof patch === "object") {
        const { event } = await updateDraftFieldsBatch(ctx, productId, patch);
        events.push(event);
      } else {
        const field = payload.field as string | undefined;
        const value = payload.value;
        if (!field) {
          return { reply: llmReply || "Ce câmp vrei să completezi?", events, newDraftId, newState, validation };
        }
        const { event } = await updateDraftField(ctx, productId, field, value);
        events.push(event);
      }
      const validatedUpdate = await validateDraft(ctx, productId);
      validation = { ready: validatedUpdate.ready, missing: validatedUpdate.missing };
      events.push(validatedUpdate.event);
      const step = getNextWizardStep(newState, validation, userMessage);
      newState = step.nextState;
      return {
        reply: llmReply || step.reply,
        events,
        newDraftId,
        newState,
        validation,
        quickReplies: step.requestedField ? [step.requestedField] : undefined,
      };
    }

    if (actionLower === "validate_draft") {
      const productId = (payload.productId ?? payload.product_id) as string | undefined;
      if (!productId || productId !== draftProductId) {
        return { reply: llmReply || "Nu am găsit draftul.", events, newDraftId, newState, validation };
      }
      const validated = await validateDraft(ctx, productId);
      validation = { ready: validated.ready, missing: validated.missing };
      events.push(validated.event);
      const step = getNextWizardStep(newState, validation, userMessage);
      newState = step.nextState;
      return {
        reply: llmReply || step.reply,
        events,
        newDraftId,
        newState,
        validation,
        quickReplies: step.requestedField ? [step.requestedField] : undefined,
      };
    }

    if (actionLower === "publish_draft") {
      const productId = (payload.productId ?? payload.product_id) as string | undefined;
      if (!productId || productId !== draftProductId) {
        return { reply: llmReply || "Nu am găsit draftul de publicat.", events, newDraftId, newState, validation };
      }
      const publishConfirmedAt = stateData.publish_confirmed_at ?? null;
      const { event } = await publishDraft(ctx, productId, {
        publishConfirmedAt,
        dailyPublishCount,
      });
      events.push(event);
      newDraftId = null;
      newState = "PUBLISHED";
      return {
        reply: llmReply || "Am publicat anunțul. Îl poți vedea la [Anunțurile mele](/dashboard/my-products).",
        events,
        newDraftId,
        newState,
        validation: { ready: true, missing: [] },
      };
    }

    if (actionLower === "create_support_ticket") {
      const subject = (payload.subject as string)?.trim()?.slice(0, 200) || "Asistent – cerere suport";
      const message = (payload.message as string)?.trim()?.slice(0, 2000) || userMessage.slice(0, 2000);
      if (!userEmail) {
        return {
          reply: llmReply || "Pentru a crea un tichet de suport, trebuie să fii autentificat cu un email.",
          events,
          newDraftId,
          newState,
          validation,
        };
      }
      const { ticketId, event } = await createSupportTicket(ctx, {
        subject,
        message,
        category: (payload.category as string) || "general",
        dailyTicketCount: dailySupportTicketCount,
        userEmail,
      });
      events.push(event);
      return {
        reply: llmReply || `Am creat tichetul de suport. Îl poți vedea la [Suport](/dashboard/support).`,
        events,
        newDraftId,
        newState,
        validation,
      };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.error("[runAssistantTurn] action failed:", actionLower, errMsg);
    }
    return {
      reply: llmReply || "Acțiunea nu a putut fi efectuată. Încearcă din nou sau reformulează.",
      events,
      newDraftId,
      newState,
      validation,
      error: errMsg,
    };
  }

  return {
    reply: llmReply || "Cu ce te pot ajuta?",
    events,
    newDraftId,
    newState,
    validation,
  };
}
