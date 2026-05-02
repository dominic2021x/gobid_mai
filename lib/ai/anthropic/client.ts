import "server-only";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_ERROR_BODY_LENGTH = 2000;

/** Single text block in a message (Anthropic format). */
export type AnthropicTextBlock = { type: "text"; text: string };

/** Message role and content (Anthropic format). */
export type AnthropicMessage = {
  role: "user" | "assistant";
  content: AnthropicTextBlock[];
};

/** Request body for Anthropic Messages API. */
export type AnthropicMessagesParams = {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  signal?: AbortSignal;
};

/** Usage in API response. */
export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
};

/** Content block in API response. */
export type AnthropicContentBlock = { type: string; text?: string };

/** Full response from Anthropic Messages API. */
export type AnthropicMessagesResponse = {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: AnthropicUsage;
};

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return key.trim();
}

/**
 * Call Anthropic Messages API. Server-only; key is read from env.
 * Uses fetch with cache: "no-store". On non-OK response throws with truncated body (max 2000 chars).
 */
export async function anthropicMessages(
  params: AnthropicMessagesParams
): Promise<AnthropicMessagesResponse> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: params.messages,
  };
  if (params.system !== undefined) body.system = params.system;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: params.signal,
  });

  if (!res.ok) {
    const raw = await res.text();
    const truncated =
      raw.length > MAX_ERROR_BODY_LENGTH
        ? raw.slice(0, MAX_ERROR_BODY_LENGTH) + "..."
        : raw;
    throw new Error(`Anthropic API error ${res.status}: ${truncated}`);
  }

  const data = (await res.json()) as AnthropicMessagesResponse;
  return data;
}
