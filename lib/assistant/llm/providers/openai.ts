import { getOpenAIClient } from "@/lib/ai/openai";
import type { ChatMessage, LlmCompleteInput, LlmCompleteResult, LlmProvider } from "../provider";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * OpenAI provider: chat completion, no tool calling.
 * Env: OPENAI_API_KEY. Optional: ASSISTANT_OPENAI_MODEL, ASSISTANT_OPENAI_TIMEOUT_MS.
 */
export function createOpenAIProvider(): LlmProvider {
  const model = process.env.ASSISTANT_OPENAI_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = Math.min(
    Math.max(5_000, parseInt(process.env.ASSISTANT_OPENAI_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS),
    60_000
  );

  return {
    async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
      const openai = getOpenAIClient();
      const messages = input.messages.map((m) => ({ role: m.role, content: m.content }));
      const completion = await openai.chat.completions.create(
        {
          model,
          messages: messages as never,
          max_tokens: input.max_tokens ?? 500,
          temperature: 0.3,
        },
        { timeout: timeoutMs }
      );
      const content = completion.choices[0]?.message?.content;
      const text = typeof content === "string" ? content.trim() : "";
      return { text };
    },
  };
}
