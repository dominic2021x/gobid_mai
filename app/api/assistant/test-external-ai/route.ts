/**
 * Același apel ca `scripts/test-external-ai-chat.ts` – verificare din browser.
 * GET /api/assistant/test-external-ai
 */
import { loadEnvConfig } from "@next/env";
import { NextResponse } from "next/server";
import { getLlmProvider } from "@/lib/assistant/llm";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


loadEnvConfig(process.cwd());

export const runtime = "nodejs";

export async function GET() {
  const t0 = Date.now();
  try {
    const llm = getLlmProvider();
    const result = await llm.complete({
      messages: [{ role: "user", content: "Răspunde doar cu: OK." }],
      max_tokens: 10,
    });
    const elapsed = Date.now() - t0;
    const text = (result.text ?? "").trim().slice(0, 200);
    return NextResponse.json({
      ok: true,
      elapsedMs: elapsed,
      text,
      env:
        process.env.NODE_ENV === "development"
          ? {
              ASSISTANT_LLM_PROVIDER: process.env.ASSISTANT_LLM_PROVIDER ?? "(nesetat)",
              MAC_MINI_API_URL: process.env.MAC_MINI_API_URL ? "(setat)" : "(nesetat)",
              EXTERNAL_AI_API_URL: process.env.EXTERNAL_AI_API_URL ? "(setat)" : "(nesetat)",
              MAC_MINI_API_KEY: process.env.MAC_MINI_API_KEY ? "(setat)" : "(nesetat)",
              EXTERNAL_AI_API_KEY: process.env.EXTERNAL_AI_API_KEY ? "(setat)" : "(nesetat)",
            }
          : undefined,
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, elapsedMs: elapsed, error: msg }, { status: 200 });
  }
}
