/**
 * Mac mini LLM gateway: Ollama /api/generate + SSE, conversation memory, context trim, model auto-switch.
 *
 * Env:
 *   AI_GATEWAY_API_KEY     — Bearer token (required în producție)
 *   OLLAMA_BASE_URL        — default http://127.0.0.1:11434
 *   PORT                   — default 8787
 *   OLLAMA_TIMEOUT_MS      — default 120000
 *   CONTEXT_MAX_CHARS      — default 8000
 *   CONVERSATION_MAX_MESSAGES — default 6
 *   MODEL_FAST / MODEL_REASON / DYNAMIC_THRESHOLD_CHARS
 *   Ollama: OLLAMA_NUM_CTX=4096, OLLAMA_TOP_P, OLLAMA_REPEAT_PENALTY (implicit 0.9 / 1.1)
 *   Recomandare: max 2 modele în Ollama (gemma instruct + deepseek-r1) pentru RAM stabil.
 *
 * Run: npx tsx services/mac-mini-llm-api/server.ts
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";

import { appendAssistantMessage, appendUserMessage } from "./lib/conversationMemory";
import { trimPromptEnd, turnsToPrompt } from "./lib/contextTrim";
import {
  getConfiguredFallbackModel,
  pickRemoteModelForPrompt,
} from "../../lib/ai/assistantRemoteModelRouter";
import {
  generateOllamaNonStream,
  streamOllamaGenerate,
} from "./lib/ollamaGenerate";
import { DEFAULT_AI_CHAT_SYSTEM } from "../../lib/ai/aiChatSystemPrompt";

const JSON_LIMIT = 1_048_576;

function corsHeaders(): Record<string, string> {
  const allow = process.env.CORS_ORIGIN?.trim() || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function unauthorized(res: http.ServerResponse) {
  sendJson(res, 401, { error: "Unauthorized" });
}

function checkAuth(req: http.IncomingMessage): boolean {
  const required = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!required) {
    if (process.env.ALLOW_INSECURE_NO_AUTH === "true") {
      console.warn("[ai-gateway] ALLOW_INSECURE_NO_AUTH — endpoint is open.");
      return true;
    }
    console.warn("[ai-gateway] Set AI_GATEWAY_API_KEY or ALLOW_INSECURE_NO_AUTH=true (dev only).");
    return false;
  }
  const h = req.headers.authorization ?? req.headers.Authorization ?? "";
  return h === `Bearer ${required}`;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += b.length;
    if (total > JSON_LIMIT) {
      throw new Error("Body too large");
    }
    chunks.push(b);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

type RequestBody = {
  conversationId?: string;
  prompt?: string;
  system?: string;
  model?: string;
  stream?: boolean;
};

function parseBody(raw: unknown): RequestBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as RequestBody;
}

async function pipeNdjsonToSse(
  bodyStream: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  meta: { model: string; conversationId: string; modelFallbackApplied?: boolean }
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...corsHeaders(),
  });

  res.write(
    `data: ${JSON.stringify({
      type: "meta",
      model: meta.model,
      conversationId: meta.conversationId,
      ...(meta.modelFallbackApplied ? { modelFallbackApplied: true } : {}),
    })}\n\n`
  );

  const reader = bodyStream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let obj: { response?: string; done?: boolean };
        try {
          obj = JSON.parse(t) as { response?: string; done?: boolean };
        } catch {
          continue;
        }
        if (typeof obj.response === "string" && obj.response.length > 0) {
          full += obj.response;
          res.write(
            `data: ${JSON.stringify({ type: "token", token: obj.response })}\n\n`
          );
        }
      }
    }
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer.trim()) as { response?: string };
        if (typeof obj.response === "string" && obj.response.length > 0) {
          full += obj.response;
          res.write(
            `data: ${JSON.stringify({ type: "token", token: obj.response })}\n\n`
          );
        }
      } catch {
        /* ignore */
      }
    }
  } finally {
    reader.releaseLock();
  }

  res.write(
    `data: ${JSON.stringify({
      type: "done",
      model: meta.model,
      conversationId: meta.conversationId,
      text: full,
      ...(meta.modelFallbackApplied ? { modelFallbackApplied: true } : {}),
    })}\n\n`
  );
  res.end();
  return full;
}

async function handleGenerate(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const body = parseBody(rawBody);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    sendJson(res, 400, { error: "Missing prompt" });
    return;
  }

  const system =
    typeof body.system === "string" && body.system.trim()
      ? body.system
      : DEFAULT_AI_CHAT_SYSTEM;
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : randomUUID();
  /** Implicit JSON (compat proxy); pune `"stream": true` pentru SSE. */
  const wantStream = body.stream === true;

  const turnsAfterUser = appendUserMessage(conversationId, prompt.trim());
  const fullPromptRaw = turnsToPrompt(system, turnsAfterUser);
  const { text: trimmedPrompt, truncated } = trimPromptEnd(fullPromptRaw);
  const combinedForRoute = `${system}\n${prompt}`;
  const primaryModel =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : pickRemoteModelForPrompt(trimmedPrompt.length, combinedForRoute);
  const fallbackModel = getConfiguredFallbackModel();

  const ollamaBase =
    process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const timeoutMs =
    parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "", 10) || 120_000;

  const runWithModel = async (model: string, modelFallbackApplied?: boolean) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (wantStream) {
        const stream = await streamOllamaGenerate({
          ollamaBase,
          model,
          prompt: trimmedPrompt,
          signal: controller.signal,
        });
        const fullText = await pipeNdjsonToSse(stream, res, {
          model,
          conversationId,
          modelFallbackApplied,
        });
        appendAssistantMessage(conversationId, fullText);
        return;
      }
      const text = await generateOllamaNonStream({
        ollamaBase,
        model,
        prompt: trimmedPrompt,
        signal: controller.signal,
      });
      appendAssistantMessage(conversationId, text);
      sendJson(res, 200, {
        message: text,
        response: text,
        text,
        model,
        conversationId,
        contextTruncated: truncated,
        stream: false,
      });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    await runWithModel(primaryModel);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = msg.toLowerCase().includes("abort");
    if (primaryModel !== fallbackModel && !isAbort) {
      try {
        if (wantStream && !res.headersSent) {
          await runWithModel(fallbackModel, true);
          return;
        }
        if (wantStream && res.headersSent) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: msg,
              model: primaryModel,
            })}\n\n`
          );
          res.end();
          return;
        }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const text = await generateOllamaNonStream({
            ollamaBase,
            model: fallbackModel,
            prompt: trimmedPrompt,
            signal: controller.signal,
          });
          appendAssistantMessage(conversationId, text);
          sendJson(res, 200, {
            message: text,
            response: text,
            text,
            model: fallbackModel,
            conversationId,
            modelFallbackApplied: true,
            contextTruncated: truncated,
            stream: false,
          });
        } finally {
          clearTimeout(t);
        }
        return;
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        if (!res.headersSent) {
          sendJson(res, 502, {
            error: "Ollama request failed",
            details: msg2,
            model: fallbackModel,
            modelFallbackApplied: true,
            conversationId,
          });
        } else {
          res.write(
            `data: ${JSON.stringify({ type: "error", error: msg2, model: fallbackModel })}\n\n`
          );
          res.end();
        }
        return;
      }
    }
    if (!res.headersSent) {
      sendJson(res, isAbort ? 504 : 502, {
        error: isAbort ? "Upstream timeout" : "Ollama request failed",
        details: msg,
        model: primaryModel,
        conversationId,
      });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", error: msg, model: primaryModel })}\n\n`
      );
      res.end();
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    const ok = !!process.env.AI_GATEWAY_API_KEY?.trim();
    sendJson(res, 200, {
      ok: true,
      service: "mac-mini-llm-api",
      authConfigured: ok,
      ollama: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
    });
    return;
  }

  if (req.method === "POST" && (req.url === "/v1/generate" || req.url === "/generate")) {
    void handleGenerate(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const port = parseInt(process.env.PORT ?? "", 10) || 8787;
server.listen(port, () => {
  console.log(
    `[mac-mini-llm-api] listening on :${port} — POST /v1/generate (SSE) | Ollama ${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}`
  );
});
