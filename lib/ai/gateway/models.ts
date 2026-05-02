import { isComplexCombinedPrompt } from "@/lib/ai/complexPromptRouting";
import { isBlockedHeavyModel } from "@/lib/ai/assistantRemoteModelRouter";

export type GatewayTask = "default" | "reasoning" | "long_context";

const DEFAULT_MODEL = "gemma:7b";
const REASONING_MODEL = "mistral:7b-instruct";
const LONG_MODEL = "mixtral:8x7b";
const FALLBACK_MODEL = "llama3:8b";

export function gatewayModelDefault(): string {
  return process.env.AI_GATEWAY_MODEL_DEFAULT?.trim() || DEFAULT_MODEL;
}

export function gatewayModelReasoning(): string {
  return process.env.AI_GATEWAY_MODEL_REASONING?.trim() || REASONING_MODEL;
}

export function gatewayModelLong(): string {
  return process.env.AI_GATEWAY_MODEL_LONG?.trim() || LONG_MODEL;
}

export function gatewayModelFallback(): string {
  return process.env.AI_GATEWAY_MODEL_FALLBACK?.trim() || FALLBACK_MODEL;
}

function totalChars(messages: ReadonlyArray<{ content?: unknown }>): number {
  let n = 0;
  for (const m of messages) {
    n += String(m.content ?? "").length;
  }
  return n;
}

function combinedText(messages: ReadonlyArray<{ content?: unknown }>): string {
  return messages.map((m) => String(m.content ?? "")).join("\n");
}

/**
 * Alege modelul principal: explicit body.model, task, lungime context, complexitate.
 */
export function pickGatewayPrimaryModel(params: {
  body: Record<string, unknown>;
  messages: ReadonlyArray<{ role?: string; content?: unknown }>;
  longContextThreshold: number;
}): string {
  const raw = typeof params.body.model === "string" ? params.body.model.trim() : "";
  if (raw) {
    if (isBlockedHeavyModel(raw)) return gatewayModelDefault();
    return raw;
  }

  const taskRaw = typeof params.body.task === "string" ? params.body.task.trim().toLowerCase() : "";
  const task: GatewayTask =
    taskRaw === "reasoning"
      ? "reasoning"
      : taskRaw === "long_context" || taskRaw === "long"
        ? "long_context"
        : "default";

  if (task === "reasoning") return gatewayModelReasoning();
  if (task === "long_context") return gatewayModelLong();

  const tc = totalChars(params.messages);
  const comb = combinedText(params.messages);
  if (tc >= params.longContextThreshold) return gatewayModelLong();

  if (isComplexCombinedPrompt(comb, tc)) return gatewayModelReasoning();

  const shortT = parseInt(process.env.AI_GATEWAY_SHORT_CHARS ?? "", 10);
  const shortThreshold = Number.isFinite(shortT) && shortT > 0 ? shortT : 1200;
  if (tc < shortThreshold) return gatewayModelDefault();

  return gatewayModelReasoning();
}

/**
 * Lanț retry: după eșec → llama (ușor), apoi mistral, apoi mixtral (ultimul — mare RAM).
 */
export function buildGatewayModelRetryChain(primary: string): string[] {
  const fb = gatewayModelFallback();
  const reason = gatewayModelReasoning();
  const long = gatewayModelLong();
  const seq = [primary, fb, reason, long];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of seq) {
    const t = m.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
