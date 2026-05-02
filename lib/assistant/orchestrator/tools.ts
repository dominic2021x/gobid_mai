/**
 * Orchestrator tools: createDraftListing, updateDraftField, validateDraft, publishDraft, createSupportTicket.
 * Ownership checks + policy allowlist; assistant_events logging for chat notifications.
 * Publish requires explicit user confirmation (policy). Quotas in policy.
 */

import type { AssistantContext } from "@/lib/assistant/tools/types";
import {
  createDraftListing as createDraftListingBase,
  updateDraftField as updateDraftFieldBase,
  updateDraftFieldsBatch as updateDraftFieldsBatchBase,
  validateDraft as validateDraftBase,
  publishDraft as publishDraftBase,
} from "@/lib/assistant/tools";
import type { ValidateDraftResult } from "@/lib/assistant/tools";
import {
  DAILY_PUBLISH_LIMIT,
  PUBLISH_CONFIRMATION_TTL_MS,
  DAILY_SUPPORT_TICKET_LIMIT,
  isAllowedDraftField,
} from "./policy";
import { supabaseAdmin } from "@/lib/supabase";

export type OrchestratorContext = AssistantContext & {
  conversationId: string;
};

export type AssistantEventPayload = {
  productId?: string;
  field?: string;
  fields?: string[];
  value?: unknown;
  ready?: boolean;
  missing?: string[];
  error?: string;
  ticketId?: string;
  subject?: string;
};

export type AssistantEvent = { event_type: string; payload: AssistantEventPayload };

async function logEvent(
  ctx: OrchestratorContext,
  eventType: string,
  payload: AssistantEventPayload
): Promise<AssistantEvent> {
  const { supabase, conversationId, userId } = ctx;
  await supabase.from("assistant_events").insert({
    conversation_id: conversationId,
    user_id: userId,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
  });
  return { event_type: eventType, payload };
}

/** Re-export policy allowlist for runAssistantTurn. */
export { ALLOWED_TOOLS as ALLOWED_ACTIONS } from "./policy";
export type { AllowedToolName as AllowedActionName } from "./policy";

/**
 * Create a new draft listing. Logs draft_created event.
 */
export async function createDraftListing(
  ctx: OrchestratorContext
): Promise<{ productId: string; event: AssistantEvent }> {
  const result = await createDraftListingBase(ctx);
  const event = await logEvent(ctx, "draft_created", { productId: result.productId });
  return { productId: result.productId, event };
}

/**
 * Update a single whitelisted field. Rejects unknown fields. Logs field_updated event.
 */
export async function updateDraftField(
  ctx: OrchestratorContext,
  productId: string,
  field: string,
  value: unknown,
  category?: string | null
): Promise<{ ok: boolean; event: AssistantEvent }> {
  if (!isAllowedDraftField(field, category)) {
    throw new Error(`updateDraftField: field "${field}" is not allowed for this category`);
  }
  const result = await updateDraftFieldBase(ctx, productId, field, value);
  const event = await logEvent(ctx, "field_updated", { productId, field, value });
  return { ok: result.ok, event };
}

/**
 * Update multiple whitelisted fields in one go. Rejects unknown fields. Logs field_updated event.
 */
export async function updateDraftFieldsBatch(
  ctx: OrchestratorContext,
  productId: string,
  patch: Record<string, unknown>,
  category?: string | null
): Promise<{ ok: boolean; event: AssistantEvent }> {
  const keys = Object.keys(patch);
  for (const key of keys) {
    if (!isAllowedDraftField(key, category)) {
      throw new Error(`updateDraftFieldsBatch: field "${key}" is not allowed for this category`);
    }
  }
  const result = await updateDraftFieldsBatchBase(ctx, productId, patch);
  const event = await logEvent(ctx, "field_updated", { productId, fields: keys });
  return { ok: result.ok, event };
}

/**
 * Create a support ticket (optional allowed action). Logs support_ticket_created event.
 * Respects DAILY_SUPPORT_TICKET_LIMIT (caller must pass dailyTicketCount).
 */
export async function createSupportTicket(
  ctx: OrchestratorContext,
  options: {
    subject: string;
    message: string;
    category?: string;
    dailyTicketCount: number;
    userEmail: string;
  }
): Promise<{ ticketId: string; event: AssistantEvent }> {
  if (options.dailyTicketCount >= DAILY_SUPPORT_TICKET_LIMIT) {
    throw new Error(`createSupportTicket: daily limit (${DAILY_SUPPORT_TICKET_LIMIT}) reached. Try again tomorrow.`);
  }
  const subject = (options.subject || "Asistent – cerere suport").trim().slice(0, 200);
  const message = (options.message || "").trim().slice(0, 2000);
  if (!message) {
    throw new Error("createSupportTicket: message is required");
  }
  if (!supabaseAdmin) {
    throw new Error("createSupportTicket: server not configured");
  }
  const id = crypto.randomUUID();
  const { error: ticketError } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      id,
      user_id: ctx.userId,
      subject,
      status: "open",
      priority: "normal",
      category: options.category || "general",
    });

  if (ticketError) {
    throw new Error(`createSupportTicket: ${ticketError.message}`);
  }

  const { error: msgError } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: id,
      sender_type: "user",
      sender_id: ctx.userId,
      content: message,
    });

  if (msgError) {
    throw new Error(`createSupportTicket: message insert failed: ${msgError.message}`);
  }

  const event = await logEvent(ctx, "support_ticket_created", { ticketId: id, subject });
  return { ticketId: id, event };
}

/**
 * Validate draft (read-only). Logs validated event with ready/missing.
 */
export async function validateDraft(
  ctx: OrchestratorContext,
  productId: string
): Promise<ValidateDraftResult & { event: AssistantEvent }> {
  const result = await validateDraftBase(ctx, productId);
  const event = await logEvent(ctx, "validated", {
    productId,
    ready: result.ready,
    missing: result.missing,
  });
  return { ...result, event };
}

/**
 * Publish draft only if:
 * 1) assistant_state.data.publish_confirmed_at is set and within TTL (explicit user confirmation),
 * 2) daily publish count for user is under limit.
 * Logs published event on success.
 */
export async function publishDraft(
  ctx: OrchestratorContext,
  productId: string,
  options: {
    publishConfirmedAt: string | null;
    dailyPublishCount: number;
  }
): Promise<{ ok: boolean; event: AssistantEvent }> {
  if (!options.publishConfirmedAt) {
    throw new Error("publishDraft: explicit user confirmation required. User must say \"da, publică\" first.");
  }
  const confirmedAt = new Date(options.publishConfirmedAt).getTime();
  if (Number.isNaN(confirmedAt) || Date.now() - confirmedAt > PUBLISH_CONFIRMATION_TTL_MS) {
    throw new Error("publishDraft: confirmation expired. Say \"da, publică\" again to confirm.");
  }
  if (options.dailyPublishCount >= DAILY_PUBLISH_LIMIT) {
    throw new Error(`publishDraft: daily publish limit (${DAILY_PUBLISH_LIMIT}) reached. Try again tomorrow.`);
  }
  const result = await publishDraftBase(ctx, productId);
  const event = await logEvent(ctx, "published", { productId });
  return { ok: result.ok, event };
}
