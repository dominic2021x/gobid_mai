/**
 * Format structurat pentru completări tip chat: SYSTEM (câmp separat) + istoric + turul curent → ASSISTANT.
 */

export type ChatTurnLike = { role: string; content: string };

function roleToTag(role: string): "USER" | "ASSISTANT" {
  const r = role.toLowerCase();
  if (r === "user" || r === "utilizator") return "USER";
  return "ASSISTANT";
}

/**
 * Conținutul câmpului `prompt` lângă `system`: istoric + mesaj curent, cu etichete USER / ASSISTANT.
 * Modelul completează după ultimul „ASSISTANT:”.
 */
export function buildStructuredChatPrompt(params: {
  conversationHistory: readonly ChatTurnLike[];
  currentUserMessage: string;
}): string {
  const hist = params.conversationHistory ?? [];
  const lines: string[] = ["### CONVERSATION HISTORY"];

  if (hist.length === 0) {
    lines.push("(no prior messages in this session.)");
  } else {
    for (const m of hist) {
      const tag = roleToTag(m.role);
      lines.push(`${tag}:`);
      lines.push(String(m.content ?? "").trim());
      lines.push("");
    }
  }

  lines.push("### CURRENT TURN");
  lines.push("USER:");
  lines.push(params.currentUserMessage.trim());
  lines.push("");
  lines.push("ASSISTANT:");

  return lines.join("\n");
}
