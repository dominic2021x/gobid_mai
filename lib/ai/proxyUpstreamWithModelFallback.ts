import { getConfiguredFallbackModel } from "@/lib/ai/assistantRemoteModelRouter";
import { assistantTextFromProxiedResponse } from "@/lib/ai/externalChatPayload";
import { adaptBodyForLlmTargetUrl } from "@/lib/ai/ollamaProxyBody";

export type LocalLlmProxyResult = {
  status: number;
  data: unknown;
  raw: string;
  selectedModel: string;
  modelFallbackApplied: boolean;
};

function mergeModelMeta(
  data: unknown,
  selectedModel: string,
  modelFallbackApplied: boolean
): unknown {
  const meta = { selectedModel, modelFallbackApplied };
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return { ...(data as Record<string, unknown>), ...meta };
  }
  return { ...meta, upstreamBody: data };
}

function shouldRetryWithFallbackModel(
  fallbackModel: string,
  usedModel: string,
  res: Response,
  data: unknown | null
): boolean {
  if (usedModel === fallbackModel) return false;
  if (!res.ok) return true;
  if (data === null) return true;
  if (typeof data === "object" && data !== null && (data as Record<string, unknown>).upstreamParseFailed === true) {
    return true;
  }
  const text = assistantTextFromProxiedResponse(data);
  if (!text.trim()) {
    const o = data as Record<string, unknown>;
    if (typeof o.error === "string" && o.error) return true;
    if ("error" in o) return true;
  }
  if (text.trim().startsWith("Eroare:")) return true;
  return false;
}

/**
 * POST către LLM: model din body, apoi fallback llama3 instruct la eroare / răspuns inutil.
 */
export async function fetchLocalLlmWithModelFallback(params: {
  targetUrl: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<LocalLlmProxyResult> {
  const baseBody = adaptBodyForLlmTargetUrl(params.targetUrl, params.body);
  const fallbackModel = getConfiguredFallbackModel();
  const primaryModel =
    typeof baseBody.model === "string" && baseBody.model.trim()
      ? baseBody.model.trim()
      : fallbackModel;

  const run = async (model: string) => {
    const body = { ...baseBody, model };
    const res = await fetch(params.targetUrl, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = null;
    }
    return { res, raw, data, model };
  };

  let modelFallbackApplied = false;
  let bundle: Awaited<ReturnType<typeof run>>;

  try {
    bundle = await run(primaryModel);
  } catch (e) {
    if (primaryModel === fallbackModel) throw e;
    modelFallbackApplied = true;
    bundle = await run(fallbackModel);
  }

  let { res, raw, data, model: selectedModel } = bundle;

  if (
    !modelFallbackApplied &&
    shouldRetryWithFallbackModel(fallbackModel, selectedModel, res, data)
  ) {
    try {
      const second = await run(fallbackModel);
      modelFallbackApplied = true;
      selectedModel = fallbackModel;
      res = second.res;
      raw = second.raw;
      data = second.data;
    } catch {
      /* păstrăm primul răspuns */
    }
  }

  let payload: unknown = data;
  if (data === null && raw.length > 0) {
    payload = {
      upstreamParseFailed: true,
      status: res.status,
      preview: raw.slice(0, 500),
    };
  }

  return {
    status: res.status,
    data: mergeModelMeta(payload, selectedModel, modelFallbackApplied),
    raw,
    selectedModel,
    modelFallbackApplied,
  };
}
