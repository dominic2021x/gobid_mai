import type { AiControllerSuccess } from "@/lib/ai/aiIntelligentController";
import {
  gatewayLongContextCharThreshold,
  resolveOllamaBaseUrl,
} from "./config";
import { buildGatewayModelRetryChain, pickGatewayPrimaryModel } from "./models";
import {
  buildOllamaMessagesFromBody,
  lastUserQueryFromMessages,
  type OllamaChatMessage,
} from "./messages";
import { ollamaChatNonStream, ollamaChatStreamFetch, ollamaChatStreamToSse } from "./ollamaChat";
import { buildRagContextBlock } from "./ragNomic";
import { loadRagDocumentsFromEnvFile, parseRagDocumentsFromBody } from "./ragDocuments";

export type GatewayJsonResult =
  | { ok: true; data: AiControllerSuccess & { rag?: boolean }; status: number }
  | { ok: false; data: Record<string, unknown>; status: number };

function injectRagSystem(
  messages: OllamaChatMessage[],
  context: string
): OllamaChatMessage[] {
  if (!context.trim()) return messages;
  const prefix = `${context.trim()}\n\n`;
  const first = messages[0];
  if (first?.role === "system") {
    return [{ ...first, content: prefix + first.content }, ...messages.slice(1)];
  }
  return [{ role: "system", content: prefix }, ...messages];
}

function ragEnabled(body: Record<string, unknown>): boolean {
  return body.rag === true || body.use_rag === true;
}

async function prepareMessages(params: {
  body: Record<string, unknown>;
  baseUrl: string;
  signal: AbortSignal;
}): Promise<{ messages: OllamaChatMessage[]; ragApplied: boolean }> {
  let messages = buildOllamaMessagesFromBody(params.body);
  if (!ragEnabled(params.body)) {
    return { messages, ragApplied: false };
  }

  let docs = parseRagDocumentsFromBody(params.body);
  if (docs.length === 0) {
    docs = loadRagDocumentsFromEnvFile();
  }
  if (docs.length === 0) {
    return { messages, ragApplied: false };
  }

  const q = lastUserQueryFromMessages(messages);
  if (!q) return { messages, ragApplied: false };

  const { context, usedChunks } = await buildRagContextBlock({
    baseUrl: params.baseUrl,
    query: q,
    documents: docs,
    signal: params.signal,
  });
  if (usedChunks === 0) return { messages, ragApplied: false };
  messages = injectRagSystem(messages, context);
  return { messages, ragApplied: true };
}

export function isUnifiedGatewayActive(): boolean {
  const off = process.env.AI_GATEWAY_ENABLED?.trim().toLowerCase();
  if (off === "false" || off === "0") return false;
  return resolveOllamaBaseUrl() !== null;
}

export async function runAiGatewayJson(
  baseUrl: string,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<GatewayJsonResult> {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const hasMessages = Array.isArray(body.messages) && (body.messages as unknown[]).length > 0;
  if (!prompt.trim() && !hasMessages) {
    return {
      ok: false,
      data: {
        error: "Missing prompt or messages",
        response: "",
        model: "",
        source: "",
      },
      status: 400,
    };
  }

  const { messages, ragApplied } = await prepareMessages({
    body,
    baseUrl,
    signal,
  });

  const primary = pickGatewayPrimaryModel({
    body,
    messages,
    longContextThreshold: gatewayLongContextCharThreshold(),
  });
  const chain = buildGatewayModelRetryChain(primary);

  let lastReason = "unknown";
  for (const model of chain) {
    const res = await ollamaChatNonStream({
      baseUrl,
      model,
      messages,
      signal,
    });
    if (res.ok) {
      const data: AiControllerSuccess & { rag?: boolean } = {
        response: res.text,
        model,
        source: "ollama-gateway",
        ...(ragApplied ? { rag: true } : {}),
      };
      return { ok: true, data, status: 200 };
    }
    lastReason = res.reason;
  }

  return {
    ok: false,
    data: {
      error: "gateway_all_models_failed",
      details: lastReason,
      response: "",
      model: primary,
      source: "",
    },
    status: 502,
  };
}

export async function runAiGatewayStream(
  baseUrl: string,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const hasMessages = Array.isArray(body.messages) && (body.messages as unknown[]).length > 0;
  if (!prompt.trim() && !hasMessages) {
    return new Response(
      JSON.stringify({ error: "Missing prompt or messages" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages, ragApplied } = await prepareMessages({
    body,
    baseUrl,
    signal,
  });

  const primary = pickGatewayPrimaryModel({
    body,
    messages,
    longContextThreshold: gatewayLongContextCharThreshold(),
  });
  const chain = buildGatewayModelRetryChain(primary);

  let modelFallbackApplied = false;
  let selectedModel = primary;
  let lastReason = "all_models_failed";

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (i > 0) modelFallbackApplied = true;
    selectedModel = model;

    let res: Response | undefined;
    try {
      res = await ollamaChatStreamFetch({
        baseUrl,
        model,
        messages,
        signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastReason = msg;
      continue;
    }

    if (!res?.ok || !res.body) {
      lastReason = res ? `http_${res.status}` : "no_response";
      continue;
    }

    const stream = ollamaChatStreamToSse(res.body, signal, {
      selectedModel,
      modelFallbackApplied,
    });

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (ragApplied) headers.set("X-Gateway-RAG", "1");

    return new Response(stream, { status: 200, headers });
  }

  return new Response(
    JSON.stringify({
      error: "gateway_stream_failed",
      details: lastReason,
      model: primary,
    }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
}
