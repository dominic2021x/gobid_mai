import { NextRequest, NextResponse } from "next/server";
import { runIntelligentAiController } from "@/lib/ai/aiIntelligentController";
import { verifyAiGatewayAuth } from "@/lib/ai/gateway/auth";
import { resolveOllamaBaseUrl } from "@/lib/ai/gateway/config";
import { gatewayHealthCheck } from "@/lib/ai/gateway/health";
import {
  isUnifiedGatewayActive,
  runAiGatewayJson,
  runAiGatewayStream,
} from "@/lib/ai/gateway/handler";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Gateway unificat (când există bază Ollama configurată): streaming SSE, RAG nomic-embed-text,
 * rutare modele + retry. Altfel: controller legacy (local scurt → llama → extern).
 *
 * JSON: { response, model, source } — source poate fi ollama-gateway | cache | ollama-local | external
 * Stream: Accept: text/event-stream sau body.stream === true
 */
export async function GET(req: NextRequest) {
  const auth = verifyAiGatewayAuth(req);
  if (auth) return auth;

  const base = resolveOllamaBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "Setează OLLAMA_HOST, AI_GATEWAY_OLLAMA_BASE sau MAC_MINI_API_URL" },
      { status: 503 }
    );
  }

  const h = await gatewayHealthCheck(base);
  return NextResponse.json(h, { status: (h.ok as boolean) ? 200 : 503 });
}

export async function POST(req: NextRequest) {
  const auth = verifyAiGatewayAuth(req);
  if (auth) return auth;

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    body =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
  } catch {
    body = {};
  }

  if (isUnifiedGatewayActive()) {
    const base = resolveOllamaBaseUrl()!;
    const accept = (req.headers.get("accept") ?? "").toLowerCase();
    const wantsStream = body.stream === true || accept.includes("text/event-stream");

    if (wantsStream) {
      return runAiGatewayStream(base, body, req.signal);
    }

    const result = await runAiGatewayJson(base, body, req.signal);
    if (result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data, { status: result.status });
  }

  try {
    const result = await runIntelligentAiController(body);
    if (result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data, { status: result.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "controller_error",
        details: message,
        response: "",
        model: "",
        source: "",
      },
      { status: 500 }
    );
  }
}
