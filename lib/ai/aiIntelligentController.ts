/**
 * Controller AI pentru POST /api/ai: Ollama local (Metal) → llama local → API extern.
 * Rutare: scurt → gemma, lung/complex → mistral, la eroare → llama.
 */

import { createHash } from "node:crypto";
import {
  getConfiguredFallbackModel,
  isBlockedHeavyModel,
  pickRemoteModelForPrompt,
} from "@/lib/ai/assistantRemoteModelRouter";
import { assistantTextFromProxiedResponse } from "@/lib/ai/externalChatPayload";

export type AiControllerSuccess = {
  response: string;
  model: string;
  source: "cache" | "ollama-local" | "external" | "ollama-gateway";
};

const DEFAULT_LOCAL_TIMEOUT_MS = 5_000;
const DEFAULT_EXTERNAL_TIMEOUT_MS = 90_000;

type CacheValue = {
  response: string;
  model: string;
  source: "ollama-local" | "external";
  expires: number;
};

const memoryCache = new Map<string, CacheValue>();

function localTimeoutMs(): number {
  const n = parseInt(process.env.LOCAL_OLLAMA_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(n) && n >= 1_000 && n <= 120_000) return n;
  return DEFAULT_LOCAL_TIMEOUT_MS;
}

function externalTimeoutMs(): number {
  const n = parseInt(process.env.AI_ROUTE_EXTERNAL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(n) && n >= 5_000 && n <= 600_000) return n;
  return DEFAULT_EXTERNAL_TIMEOUT_MS;
}

function cacheTtlMs(): number {
  const n = parseInt(process.env.AI_RESPONSE_CACHE_TTL_MS ?? "", 10);
  return Number.isFinite(n) ? n : 300_000;
}

function cacheMax(): number {
  const n = parseInt(process.env.AI_RESPONSE_CACHE_MAX ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : 256;
}

function cacheEnabled(body: Record<string, unknown>): boolean {
  if (body.cache === false || body.noCache === true) return false;
  return cacheTtlMs() > 0;
}

function cacheKey(prompt: string, system: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ p: prompt, s: system }))
    .digest("hex");
}

function cachePrune(): void {
  const now = Date.now();
  const max = cacheMax();
  for (const [k, v] of memoryCache) {
    if (v.expires < now) memoryCache.delete(k);
  }
  while (memoryCache.size > max) {
    const first = memoryCache.keys().next().value;
    if (first === undefined) break;
    memoryCache.delete(first);
  }
}

function cacheGet(key: string): AiControllerSuccess | null {
  cachePrune();
  const v = memoryCache.get(key);
  if (!v || v.expires < Date.now()) {
    if (v) memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  memoryCache.set(key, v);
  return {
    response: v.response,
    model: v.model,
    source: "cache",
  };
}

function cacheSet(
  key: string,
  payload: { response: string; model: string; source: "ollama-local" | "external" }
): void {
  if (cacheTtlMs() <= 0) return;
  cachePrune();
  memoryCache.set(key, {
    ...payload,
    expires: Date.now() + cacheTtlMs(),
  });
  cachePrune();
}

function buildOllamaPrompt(system: string, prompt: string): string {
  const s = system.trim();
  if (!s) return prompt;
  return `### SYSTEM\n${s}\n\n### PROMPT\n${prompt}`;
}

/** Opțiuni ușoare pentru RAM / Metal (Ollama). */
function ollamaGenerateOptions(): Record<string, number> {
  const num_ctx = parseInt(process.env.OLLAMA_NUM_CTX ?? "", 10) || 4096;
  const num_predict = parseInt(process.env.OLLAMA_NUM_PREDICT ?? "", 10) || 1024;
  return {
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE ?? "0.7") || 0.7,
    top_p: parseFloat(process.env.OLLAMA_TOP_P ?? "0.9") || 0.9,
    repeat_penalty: parseFloat(process.env.OLLAMA_REPEAT_PENALTY ?? "1.1") || 1.1,
    num_ctx: Math.min(num_ctx, 8192),
    num_predict: Math.min(num_predict, 4096),
  };
}

async function callOllamaGenerate(params: {
  baseUrl: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt,
        stream: false,
        options: ollamaGenerateOptions(),
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }
    const o = data as { response?: string };
    const text = typeof o.response === "string" ? o.response.trim() : "";
    if (!text) return { ok: false, reason: "empty_response" };
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: msg.toLowerCase().includes("abort") ? "timeout" : msg,
    };
  } finally {
    clearTimeout(t);
  }
}

async function callExternalApi(params: {
  targetUrl: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  model: string;
  timeoutMs: number;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const { stream: _st, ...restBody } = params.body;
    const outbound = {
      ...restBody,
      model: params.model,
      stream: false,
    };
    const res = await fetch(params.targetUrl, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(outbound),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    const text =
      data !== null
        ? assistantTextFromProxiedResponse(data)
        : raw.trim();
    if (!res.ok || !text.trim() || text.startsWith("Eroare:")) {
      return { ok: false, reason: `external_${res.status}` };
    }
    return { ok: true, text: text.trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: msg.toLowerCase().includes("abort") ? "timeout" : msg,
    };
  } finally {
    clearTimeout(t);
  }
}

function resolvePrimaryModel(
  body: Record<string, unknown>,
  prompt: string,
  system: string
): string {
  const raw = typeof body.model === "string" ? body.model.trim() : "";
  if (raw) {
    if (isBlockedHeavyModel(raw)) return pickRemoteModelForPrompt(0, "");
    return raw;
  }
  const combined = `${system}\n${prompt}`;
  return pickRemoteModelForPrompt(prompt.length + system.length, combined);
}

export async function runIntelligentAiController(
  body: Record<string, unknown>
): Promise<
  | { ok: true; data: AiControllerSuccess; status: number }
  | { ok: false; data: Record<string, unknown>; status: number }
> {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const system = typeof body.system === "string" ? body.system : "";

  if (!prompt.trim()) {
    return {
      ok: false,
      data: {
        error: "Missing prompt",
        response: "",
        model: "",
        source: "",
      },
      status: 400,
    };
  }

  const key = cacheKey(prompt, system);
  if (cacheEnabled(body)) {
    const hit = cacheGet(key);
    if (hit) return { ok: true, data: hit, status: 200 };
  }

  const llama = getConfiguredFallbackModel();
  const primary = resolvePrimaryModel(body, prompt, system);
  const fullPrompt = buildOllamaPrompt(system, prompt);
  const localBase =
    process.env.OLLAMA_BASE_URL?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    "http://127.0.0.1:11434";

  const localMs = localTimeoutMs();
  const modelsToTry =
    primary === llama ? [llama] : [primary, llama];

  for (const model of modelsToTry) {
    const local = await callOllamaGenerate({
      baseUrl: localBase,
      model,
      prompt: fullPrompt,
      timeoutMs: localMs,
    });
    if (local.ok) {
      const out: AiControllerSuccess = {
        response: local.text,
        model,
        source: "ollama-local",
      };
      if (cacheEnabled(body)) {
        cacheSet(key, {
          response: out.response,
          model: out.model,
          source: "ollama-local",
        });
      }
      return { ok: true, data: out, status: 200 };
    }
  }

  const targetUrl = (
    process.env.MAC_MINI_API_URL ||
    process.env.EXTERNAL_AI_API_URL ||
    ""
  ).trim();
  const apiKey = (
    process.env.MAC_MINI_API_KEY ||
    process.env.EXTERNAL_AI_API_KEY ||
    ""
  ).trim();

  if (!targetUrl) {
    return {
      ok: false,
      data: {
        error: "local_ollama_failed_no_external_url",
        response: "",
        model: llama,
        source: "",
      },
      status: 502,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  const {
    stream: _stream,
    cache: _cache,
    noCache: _noCache,
    ...extBody
  } = body;

  const ext = await callExternalApi({
    targetUrl,
    headers,
    body: extBody as Record<string, unknown>,
    model: llama,
    timeoutMs: externalTimeoutMs(),
  });

  if (ext.ok) {
    const out: AiControllerSuccess = {
      response: ext.text,
      model: llama,
      source: "external",
    };
    if (cacheEnabled(body)) {
      cacheSet(key, {
        response: out.response,
        model: out.model,
        source: "external",
      });
    }
    return { ok: true, data: out, status: 200 };
  }

  return {
    ok: false,
    data: {
      error: "all_paths_failed",
      details: ext.reason,
      response: "",
      model: llama,
      source: "",
    },
    status: 502,
  };
}
