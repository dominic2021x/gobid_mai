/**
 * AI Gateway: Ollama upstream (VPS → Mac mini / Tailscale sau local).
 * Optimizări 24GB / Metal: vezi deploy/AI-GATEWAY-OLLAMA.md (env Ollama pe Mac mini).
 */

export function normalizeOllamaBase(hostOrUrl: string): string {
  const t = hostOrUrl.trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) {
    return t.replace(/\/+$/, "");
  }
  return `http://${t.replace(/\/+$/, "")}`;
}

/** Bază Ollama fără path (ex. http://127.0.0.1:11434). */
export function resolveOllamaBaseUrl(): string | null {
  const explicit = process.env.AI_GATEWAY_OLLAMA_BASE?.trim();
  if (explicit) return normalizeOllamaBase(explicit);

  const b = process.env.OLLAMA_BASE_URL?.trim() || process.env.OLLAMA_HOST?.trim();
  if (b) return normalizeOllamaBase(b);

  const mac =
    process.env.MAC_MINI_API_URL?.trim() || process.env.EXTERNAL_AI_API_URL?.trim();
  if (mac) {
    try {
      return new URL(mac).origin.replace(/\/+$/, "");
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function gatewayTimeoutMs(): number {
  const n = parseInt(process.env.AI_GATEWAY_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(n) && n >= 5_000 && n <= 600_000) return n;
  return 120_000;
}

export function gatewayEmbedTimeoutMs(): number {
  const n = parseInt(process.env.AI_GATEWAY_EMBED_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(n) && n >= 2_000 && n <= 120_000) return n;
  return 30_000;
}

export function gatewayRagTopK(): number {
  const n = parseInt(process.env.AI_GATEWAY_RAG_TOP_K ?? "", 10);
  if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  return 5;
}

export function gatewayRagMaxChunks(): number {
  const n = parseInt(process.env.AI_GATEWAY_RAG_MAX_CHUNKS ?? "", 10);
  if (Number.isFinite(n) && n >= 1 && n <= 64) return n;
  return 20;
}

export function gatewayLongContextCharThreshold(): number {
  const n = parseInt(process.env.AI_GATEWAY_LONG_CONTEXT_CHARS ?? "", 10);
  if (Number.isFinite(n) && n >= 2000) return n;
  return 12_000;
}

export function gatewayOllamaChatOptions(): Record<string, number> {
  const num_ctx = parseInt(process.env.AI_GATEWAY_NUM_CTX ?? "", 10) || 4096;
  const num_predict = parseInt(process.env.AI_GATEWAY_NUM_PREDICT ?? "", 10) || 1024;
  return {
    temperature: parseFloat(process.env.AI_GATEWAY_TEMPERATURE ?? "0.7") || 0.7,
    top_p: parseFloat(process.env.AI_GATEWAY_TOP_P ?? "0.9") || 0.9,
    repeat_penalty: parseFloat(process.env.AI_GATEWAY_REPEAT_PENALTY ?? "1.1") || 1.1,
    num_ctx: Math.min(Math.max(512, num_ctx), 131072),
    num_predict: Math.min(Math.max(64, num_predict), 8192),
  };
}

export function gatewayEmbedModel(): string {
  return process.env.AI_GATEWAY_EMBED_MODEL?.trim() || "nomic-embed-text";
}
