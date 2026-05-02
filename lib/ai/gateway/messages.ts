export type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

function asContent(c: unknown): string {
  return typeof c === "string" ? c : "";
}

/**
 * Convertește body-ul /api/ai în mesaje Ollama chat.
 */
export function buildOllamaMessagesFromBody(body: Record<string, unknown>): OllamaChatMessage[] {
  const msgs = body.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    const out: OllamaChatMessage[] = [];
    for (const m of msgs) {
      if (!m || typeof m !== "object" || Array.isArray(m)) continue;
      const o = m as Record<string, unknown>;
      const role = o.role;
      const content = asContent(o.content);
      if (role !== "system" && role !== "user" && role !== "assistant") continue;
      if (!content.trim() && role !== "system") continue;
      out.push({ role, content });
    }
    if (out.length > 0) return out;
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const system = typeof body.system === "string" ? body.system.trim() : "";

  const messages: OllamaChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt || " " });
  return messages;
}

/** Ultimul mesaj user pentru interogare RAG. */
export function lastUserQueryFromMessages(messages: OllamaChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].content.trim()) {
      return messages[i].content.trim();
    }
  }
  return "";
}
