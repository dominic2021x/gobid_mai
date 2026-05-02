/**
 * LLM provider abstraction for the User AI Assistant.
 * Text completion only; no tool calling. Tool usage remains in deterministic branches.
 */

export type ChatMessageRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

export type LlmCompleteInput = {
  messages: ChatMessage[];
  /** Optional max tokens for this completion (e.g. onboarding uses 220). */
  max_tokens?: number;
  /** Optional metadata for tracing (e.g. correlationId). */
  metadata?: { correlationId?: string };
};

export type LlmCompleteResult = {
  text: string;
  /** Modelul folosit efectiv după routing + eventuale fallback la gemma. */
  selectedModel?: string;
  modelFallbackApplied?: boolean;
};

/**
 * Provider returns a single text reply. Timeouts and errors are handled by the caller.
 */
export interface LlmProvider {
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
}
