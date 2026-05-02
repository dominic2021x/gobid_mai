import { getLlmProvider } from "./llm";
import { NLG_SYSTEM_PROMPT } from "./prompts/nlgSystem";

export type ReplyPlan = {
  /** Full deterministic reply text (to be rewritten). */
  deterministicReply: string;
  /** First requested/missing field, if any. */
  requestedField?: string;
  /** Quick reply labels (for context only; not in output). */
  quickReplies?: string[];
  /** Draft progress for context. */
  progress?: { status: string; filled: number; total: number };
  /** Last user message. */
  userMessage: string;
  /** Mode for tone: draft flow, help, published, or validation error. */
  mode: "draft" | "help" | "published" | "validation_error";
};

export type RecentMessage = { role: "user" | "assistant"; content: string };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const nlgCache = new Map<
  string,
  { text: string; expiresAt: number }
>();

function hashPlan(plan: ReplyPlan): string {
  const parts = [
    plan.deterministicReply,
    plan.mode,
    plan.requestedField ?? "",
    plan.progress?.status ?? "",
  ];
  let h = 0;
  const s = parts.join("\0");
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

function getCached(plan: ReplyPlan): string | null {
  const key = hashPlan(plan);
  const entry = nlgCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) nlgCache.delete(key);
    return null;
  }
  return entry.text;
}

function setCache(plan: ReplyPlan, text: string): void {
  const key = hashPlan(plan);
  nlgCache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Builds the user prompt for the NLG call: plan + optional recent context.
 */
export function buildNlgPrompt(plan: ReplyPlan, recentMessages?: RecentMessage[]): string {
  const lines: string[] = [
    "Reformulează următorul răspuns al asistentului, păstrând același sens și fără a inventa date.",
    "",
    "Mesajul utilizatorului: " + (plan.userMessage || "(nimic)").slice(0, 300),
    "",
    "Răspunsul determinist al asistentului (de reformulat):",
    plan.deterministicReply,
  ];
  if (plan.mode !== "help") {
    lines.push("", "Context: flux draft. Nu repeta meniul general; continuă natural (ex: ce câmp mai lipsește).");
  }
  if (recentMessages && recentMessages.length > 0) {
    lines.push(
      "",
      "Ultimele linii (doar context):",
      ...recentMessages.slice(-4).map((m) => `${m.role}: ${m.content.slice(0, 150)}`)
    );
  }
  return lines.join("\n");
}

/**
 * Calls the configured LLM provider (external proxy / Mac mini or OpenAI) to rewrite the deterministic reply.
 * No tools. Returns null on failure or timeout (caller falls back to deterministic text).
 */
export async function runNlg(
  plan: ReplyPlan,
  recentMessages?: RecentMessage[]
): Promise<string | null> {
  if (!plan.deterministicReply?.trim()) return null;

  const cached = getCached(plan);
  if (cached) return cached;

  try {
    const llm = getLlmProvider();
    const userContent = buildNlgPrompt(plan, recentMessages);
    const result = await llm.complete({
      messages: [
        { role: "system", content: NLG_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    const text = result.text?.trim();
    if (text && text.length > 0 && text.length <= 2000) {
      setCache(plan, text);
      return text;
    }
  } catch {
    // Fallback: caller uses deterministic reply
  }
  return null;
}
