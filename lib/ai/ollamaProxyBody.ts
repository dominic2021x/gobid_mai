/**
 * Transformă body-ul intern { prompt, system, model } în formatul așteptat de Ollama.
 * Evită erori când EXTERNAL_AI_URL pointează la /api/generate sau /api/chat.
 */

export function adaptBodyForLlmTargetUrl(
  targetUrl: string,
  body: Record<string, unknown>
): Record<string, unknown> {
  let pathname = "";
  try {
    pathname = new URL(targetUrl).pathname;
  } catch {
    return body;
  }

  const model = body.model;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const system = typeof body.system === "string" ? body.system.trim() : "";

  const lower = pathname.toLowerCase();

  if (lower.includes("/api/generate")) {
    const merged = system
      ? `### SYSTEM\n${system}\n\n### USER\n${prompt}`
      : prompt;
    return {
      model,
      prompt: merged,
      stream: false,
    };
  }

  if (lower.includes("/api/chat")) {
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt || " " });
    return {
      model,
      messages,
      stream: false,
    };
  }

  return body;
}
