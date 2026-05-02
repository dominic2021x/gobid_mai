import type { LlmProvider } from "./provider";
import { resolveAssistantLlmProviderName } from "./assistantLlmConfig";
import { createExternalProxyAiProvider } from "./providers/externalProxy";
import { createOpenAIProvider } from "./providers/openai";

const PROVIDER_ENV = "ASSISTANT_LLM_PROVIDER";

let cachedProvider: LlmProvider | null = null;

/**
 * Asistent: server AI remote (Mac mini / EXTERNAL_AI_API_URL) sau OpenAI.
 */
export function getLlmProvider(): LlmProvider {
  if (process.env.NODE_ENV !== "development" && cachedProvider) return cachedProvider;
  const provider = resolveAssistantLlmProviderName();
  if (process.env.NODE_ENV === "development") {
    const envValue = process.env[PROVIDER_ENV] ?? "(nesetat)";
    console.log("[CHAT][PROVIDER_RESOLVE]", "ASSISTANT_LLM_PROVIDER=" + envValue, "actual=" + provider);
  }
  if (provider === "external") {
    cachedProvider = createExternalProxyAiProvider();
  } else {
    cachedProvider = createOpenAIProvider();
  }
  return cachedProvider;
}

export type { ChatMessage, LlmCompleteInput, LlmCompleteResult, LlmProvider } from "./provider";
export {
  assistantLlmKindUsesRemoteTroubleshoot,
  getAssistantLlmKind,
  isAssistantLlmUnreachableError,
  resolveAssistantLlmProviderName,
} from "./assistantLlmConfig";
export { createOpenAIProvider } from "./providers/openai";
