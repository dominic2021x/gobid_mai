import { gatewayOllamaChatOptions, gatewayTimeoutMs } from "./config";
import type { OllamaChatMessage } from "./messages";

function parseNonStreamChatPayload(raw: string, res: Response): { text: string; err?: string } {
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return { text: "", err: "invalid_json" };
  }
  if (!res.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error ?? `http_${res.status}`);
    return { text: "", err };
  }
  const msg = data.message as { content?: string } | undefined;
  const text = typeof msg?.content === "string" ? msg.content.trim() : "";
  if (!text && typeof data.error === "string") {
    return { text: "", err: data.error };
  }
  return { text };
}

export async function ollamaChatNonStream(params: {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  signal: AbortSignal;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string; status: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), gatewayTimeoutMs());
  const onParentAbort = () => controller.abort();
  params.signal.addEventListener("abort", onParentAbort, { once: true });

  try {
    const res = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: false,
        options: gatewayOllamaChatOptions(),
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    const parsed = parseNonStreamChatPayload(raw, res);
    if (parsed.err || !parsed.text) {
      return {
        ok: false,
        reason: parsed.err || "empty_response",
        status: res.status || 502,
      };
    }
    return { ok: true, text: parsed.text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = msg.toLowerCase().includes("abort") ? "timeout" : msg;
    return { ok: false, reason, status: 502 };
  } finally {
    clearTimeout(t);
    params.signal.removeEventListener("abort", onParentAbort);
  }
}

function sseLine(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * Transformă NDJSON Ollama (stream) în SSE pentru client.
 */
export function ollamaChatStreamToSse(
  ollamaBody: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  meta: { selectedModel: string; modelFallbackApplied: boolean }
): ReadableStream<Uint8Array> {
  const reader = ollamaBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(
        sseLine({
          meta: {
            model: meta.selectedModel,
            modelFallbackApplied: meta.modelFallbackApplied,
          },
        })
      );

      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let obj: Record<string, unknown>;
            try {
              obj = JSON.parse(trimmed) as Record<string, unknown>;
            } catch {
              continue;
            }
            if (obj.error) {
              const err =
                typeof obj.error === "string" ? obj.error : JSON.stringify(obj.error);
              controller.enqueue(sseLine({ error: err }));
              continue;
            }
            const msg = obj.message as { content?: string } | undefined;
            const piece = msg?.content;
            if (typeof piece === "string" && piece.length > 0) {
              controller.enqueue(sseLine({ content: piece }));
            }
            if (obj.done === true) {
              controller.enqueue(
                sseLine({
                  done: true,
                  model: typeof obj.model === "string" ? obj.model : meta.selectedModel,
                })
              );
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(sseLine({ error: msg }));
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        controller.close();
      }
    },
  });
}

export async function ollamaChatStreamFetch(params: {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  signal: AbortSignal;
}): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), gatewayTimeoutMs());
  const onAbort = () => {
    clearTimeout(t);
    controller.abort();
  };
  params.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        options: gatewayOllamaChatOptions(),
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    params.signal.removeEventListener("abort", onAbort);
    return res;
  } catch (e) {
    clearTimeout(t);
    params.signal.removeEventListener("abort", onAbort);
    throw e;
  }
}
