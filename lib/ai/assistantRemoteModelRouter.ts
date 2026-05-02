/**
 * Rutare 3 modele (Mac mini / VPS): scurt → gemma; complex/lung/mediu → mistral; fallback la erori → llama.
 * Env: ASSISTANT_AI_MODEL_FAST, ASSISTANT_AI_MODEL_DEFAULT (sau ASSISTANT_AI_MODEL_REASON), ASSISTANT_AI_MODEL_FALLBACK,
 *      ASSISTANT_AI_SHORT_THRESHOLD_CHARS, ASSISTANT_AI_DYNAMIC_THRESHOLD_CHARS.
 */

import { isComplexCombinedPrompt } from "@/lib/ai/complexPromptRouting";

export const DEFAULT_ASSISTANT_AI_MODEL_FAST = "gemma:7b-instruct-q4_K_M";
export const DEFAULT_ASSISTANT_AI_MODEL_DEFAULT = "mistral:7b-instruct-q5_K_M";
export const DEFAULT_ASSISTANT_AI_MODEL_FALLBACK = "llama3:8b-instruct-q4_K_M";

/** @deprecated folosește DEFAULT_ASSISTANT_AI_MODEL_DEFAULT */
export const DEFAULT_ASSISTANT_AI_MODEL_REASON = DEFAULT_ASSISTANT_AI_MODEL_DEFAULT;

const HEAVY_MODEL_RE =
  /\b(31|32|33|34|70|72)\s*b\b|\b31b\b|\b32b\b|\b70b\b|qwen2\.5.?32|mixtral.?8x22|llama.?3\.3.?70/i;

export function isBlockedHeavyModel(name: string): boolean {
  return HEAVY_MODEL_RE.test(name.trim());
}

function envInt(key: string, fallback: number): number {
  const n = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfiguredFastModel(): string {
  const v = process.env.ASSISTANT_AI_MODEL_FAST?.trim();
  if (v && !isBlockedHeavyModel(v)) return v;
  return DEFAULT_ASSISTANT_AI_MODEL_FAST;
}

export function getConfiguredDefaultModel(): string {
  const v =
    process.env.ASSISTANT_AI_MODEL_DEFAULT?.trim() ||
    process.env.ASSISTANT_AI_MODEL_REASON?.trim();
  if (v && !isBlockedHeavyModel(v)) return v;
  return DEFAULT_ASSISTANT_AI_MODEL_DEFAULT;
}

/** @deprecated alias pentru getConfiguredDefaultModel */
export function getConfiguredReasonModel(): string {
  return getConfiguredDefaultModel();
}

export function getConfiguredFallbackModel(): string {
  const v = process.env.ASSISTANT_AI_MODEL_FALLBACK?.trim();
  if (v && !isBlockedHeavyModel(v)) return v;
  return DEFAULT_ASSISTANT_AI_MODEL_FALLBACK;
}

/**
 * Scurt + simplu → gemma; complex SAU lung SAU mediu (≥ short threshold) → mistral.
 */
export function pickRemoteModelForPrompt(totalChars: number, combinedText: string): string {
  const shortThreshold = envInt("ASSISTANT_AI_SHORT_THRESHOLD_CHARS", 1200);
  const longThreshold = envInt("ASSISTANT_AI_DYNAMIC_THRESHOLD_CHARS", 2200);

  if (isComplexCombinedPrompt(combinedText, totalChars)) return getConfiguredDefaultModel();
  if (totalChars >= longThreshold) return getConfiguredDefaultModel();
  if (totalChars < shortThreshold) return getConfiguredFastModel();
  return getConfiguredDefaultModel();
}

/** Ordinea de încercare: primul e rutat, apoi llama ca fallback comun. */
export function buildModelAttemptOrder(primaryModel: string): string[] {
  const fb = getConfiguredFallbackModel();
  const out: string[] = [];
  if (primaryModel.trim()) out.push(primaryModel.trim());
  if (fb && fb !== primaryModel.trim()) out.push(fb);
  return out;
}

export function pickRemoteModelFromTextLength(totalChars: number): string {
  return pickRemoteModelForPrompt(totalChars, "");
}

export function totalCharsFromChatMessages(
  messages: ReadonlyArray<{ role?: string; content?: unknown }>
): number {
  let n = 0;
  for (const m of messages) {
    n += String(m.content ?? "").length;
  }
  return n;
}

export function extractPromptCharLengthFromProxyBody(body: unknown): number {
  const { totalChars } = extractCombinedRoutingTextFromProxyBody(body);
  return totalChars;
}

export function extractCombinedRoutingTextFromProxyBody(body: unknown): {
  totalChars: number;
  combinedText: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { totalChars: 0, combinedText: "" };
  }
  const o = body as Record<string, unknown>;
  if (typeof o.prompt === "string" || typeof o.system === "string") {
    const p = typeof o.prompt === "string" ? o.prompt : "";
    const s = typeof o.system === "string" ? o.system : "";
    return { totalChars: p.length + s.length, combinedText: `${s}\n${p}` };
  }
  if (Array.isArray(o.messages)) {
    const msgs = o.messages as { role?: string; content?: unknown }[];
    const combinedText = msgs.map((m) => String(m.content ?? "")).join("\n");
    return { totalChars: totalCharsFromChatMessages(msgs), combinedText };
  }
  return { totalChars: 0, combinedText: "" };
}

export function normalizeProxyModelField(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const o = { ...(body as Record<string, unknown>) };
  const rawModel = o.model;
  const explicit = typeof rawModel === "string" && rawModel.trim().length > 0;

  if (explicit && isBlockedHeavyModel(String(rawModel))) {
    o.model = getConfiguredFastModel();
    return o;
  }

  if (!explicit) {
    const { totalChars, combinedText } = extractCombinedRoutingTextFromProxyBody(o);
    o.model = pickRemoteModelForPrompt(totalChars, combinedText);
  }

  return o;
}
