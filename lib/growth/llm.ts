import "server-only";

const MODEL = "gpt-4o-mini";
const FETCH_TIMEOUT_MS = 30000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
}

/**
 * Call OpenAI chat completions. Server-only; never log tokens or full responses.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options?.max_tokens ?? 4096,
  };
  if (options?.temperature != null) body.temperature = options.temperature;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
