/** Rezolvare provider LLM pentru Asistentul din dashboard. */

export type AssistantLlmKind = "openai" | "external";

const PROVIDER_ENV = "ASSISTANT_LLM_PROVIDER";

export function resolveAssistantLlmProviderName(): AssistantLlmKind {
  const raw = (process.env[PROVIDER_ENV] ?? "").trim().toLowerCase();
  const normalized = raw === "mac_mini" || raw === "proxy" ? "external" : raw;

  if (normalized === "external") return "external";
  if (normalized === "openai") return "openai";

  const hasExternalUrl =
    !!process.env.EXTERNAL_AI_API_URL?.trim() || !!process.env.MAC_MINI_API_URL?.trim();

  if (hasExternalUrl) return "external";
  return "openai";
}

export function getAssistantLlmKind(): AssistantLlmKind {
  return resolveAssistantLlmProviderName();
}

export function isAssistantLlmUnreachableError(msg: string): boolean {
  return msg.includes("EXTERNAL_AI_UNREACHABLE");
}

export function assistantLlmKindUsesRemoteTroubleshoot(kind: AssistantLlmKind): boolean {
  return kind === "external";
}
