import {
  assistantTextFromProxiedResponse,
  buildExternalProxyBodyFromAssistantMessages,
} from "@/lib/ai/externalChatPayload";
import { normalizeProxyModelField } from "@/lib/ai/assistantRemoteModelRouter";
import { fetchLocalLlmWithModelFallback } from "@/lib/ai/proxyUpstreamWithModelFallback";
import type { LlmCompleteInput, LlmCompleteResult, LlmProvider } from "../provider";

const DEFAULT_TIMEOUT_MS = 120_000;

function shouldSendProxyAuth(): boolean {
  const raw = (process.env.ASSISTANT_EXTERNAL_AI_SEND_AUTH ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

/**
 * Asistent dashboard → același backend ca POST /api/ai (ex. Mac mini).
 * Env: MAC_MINI_API_URL sau EXTERNAL_AI_API_URL, MAC_MINI_API_KEY sau EXTERNAL_AI_API_KEY.
 * Dacă Ollama e expus direct (fără nginx cu auth), setează ASSISTANT_EXTERNAL_AI_SEND_AUTH=false.
 */
export function createExternalProxyAiProvider(): LlmProvider {
  const timeoutMs = Math.min(
    Math.max(10_000, parseInt(process.env.ASSISTANT_EXTERNAL_AI_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS),
    300_000
  );

  return {
    async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
      const targetUrl =
        process.env.MAC_MINI_API_URL?.trim() || process.env.EXTERNAL_AI_API_URL?.trim();
      const apiKey =
        process.env.MAC_MINI_API_KEY?.trim() || process.env.EXTERNAL_AI_API_KEY?.trim();

      if (!targetUrl) {
        throw new Error(
          "EXTERNAL_AI_UNREACHABLE: Lipsește MAC_MINI_API_URL sau EXTERNAL_AI_API_URL în .env."
        );
      }

      let body: Record<string, unknown> = buildExternalProxyBodyFromAssistantMessages(
        input.messages
      ) as unknown as Record<string, unknown>;
      body = normalizeProxyModelField(body) as Record<string, unknown>;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (apiKey && shouldSendProxyAuth()) {
        headers.Authorization = `Bearer ${apiKey}`;
        headers["x-api-key"] = apiKey;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let result: Awaited<ReturnType<typeof fetchLocalLlmWithModelFallback>>;
      try {
        result = await fetchLocalLlmWithModelFallback({
          targetUrl,
          headers,
          body,
          signal: controller.signal,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(
          `EXTERNAL_AI_UNREACHABLE: ${m.includes("abort") ? `Timeout după ${timeoutMs}ms` : m}`
        );
      } finally {
        clearTimeout(timer);
      }

      const data = result.data;
      if (
        typeof data === "object" &&
        data !== null &&
        (data as Record<string, unknown>).upstreamParseFailed === true
      ) {
        const preview = String((data as { preview?: unknown }).preview ?? "").slice(0, 200);
        throw new Error(`EXTERNAL_AI_UNREACHABLE: Răspuns non-JSON: ${preview}`);
      }
      if (result.status < 200 || result.status >= 300) {
        const errSnippet =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? result.status)
            : String(result.raw).slice(0, 200);
        throw new Error(`EXTERNAL_AI_UNREACHABLE: HTTP ${result.status} — ${errSnippet}`);
      }

      const text = assistantTextFromProxiedResponse(data);
      if (!text.trim() && typeof data === "object" && data !== null && "error" in data) {
        throw new Error(`EXTERNAL_AI_UNREACHABLE: ${String((data as { error?: unknown }).error)}`);
      }
      return {
        text,
        selectedModel: result.selectedModel,
        modelFallbackApplied: result.modelFallbackApplied,
      };
    },
  };
}
