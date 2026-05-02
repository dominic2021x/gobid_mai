import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET /api/assistant/external-ai-health
 * Verifică dacă URL-ul AI extern (Mac mini) răspunde la GET (timeout 5s).
 * Multe endpoint-uri acceptă doar POST — un 404/405 înseamnă totuși că hostul e accesibil.
 */
export async function GET() {
  const baseUrl =
    process.env.MAC_MINI_API_URL?.trim() || process.env.EXTERNAL_AI_API_URL?.trim();
  const apiKey =
    process.env.MAC_MINI_API_KEY?.trim() || process.env.EXTERNAL_AI_API_KEY?.trim();

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      message:
        "Lipsește MAC_MINI_API_URL sau EXTERNAL_AI_API_URL. Setează URL-ul backend-ului AI (ex. Mac mini).",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiKey) {
    (headers as Record<string, string>).Authorization = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(baseUrl, {
      method: "GET",
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeoutId);

    const reachable = res.status > 0;
    const note =
      res.status === 404 || res.status === 405
        ? "Normal dacă serverul acceptă doar POST la acest URL; chat-ul folosește POST."
        : undefined;

    return NextResponse.json({
      ok: reachable,
      url: baseUrl,
      status: res.status,
      message: reachable
        ? `Server a răspuns (HTTP ${res.status}).`
        : "Fără răspuns HTTP valid.",
      ...(note ? { hint: note } : {}),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause : undefined;
    const isRefused =
      msg.toLowerCase().includes("econnrefused") ||
      msg.toLowerCase().includes("fetch failed") ||
      cause?.code === "ECONNREFUSED";
    const friendly = isRefused
      ? "Nu mă pot conecta la URL-ul AI. Verifică Mac mini / rețea / firewall și că URL-ul din .env e corect."
      : msg.toLowerCase().includes("abort")
        ? "Timeout 5s — serverul nu a răspuns la GET."
        : msg;
    return NextResponse.json({
      ok: false,
      url: baseUrl,
      message: friendly,
    });
  }
}
