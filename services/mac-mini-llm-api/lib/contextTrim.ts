import { buildStructuredChatPrompt, type ChatTurnLike } from "../../../lib/ai/chatPromptFormat";
import type { ChatTurn } from "./conversationMemory";

function maxContextChars(): number {
  const n = parseInt(process.env.CONTEXT_MAX_CHARS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 8000;
}

/** Aliniat cu gobid: ### SYSTEM + format USER/ASSISTANT din chatPromptFormat. */
export function turnsToPrompt(system: string, turns: ChatTurn[]): string {
  const s = system.trim();
  if (turns.length === 0) {
    const body = buildStructuredChatPrompt({
      conversationHistory: [],
      currentUserMessage: " ",
    });
    return s ? `### SYSTEM\n${s}\n\n${body}` : body;
  }
  const histTurns: ChatTurnLike[] = turns.slice(0, -1).map((t) => ({
    role: t.role,
    content: t.content,
  }));
  const last = turns[turns.length - 1]!;
  const current =
    last.role === "user" ? last.content.trim() : String(last.content ?? "").trim();
  const body = buildStructuredChatPrompt({
    conversationHistory: histTurns,
    currentUserMessage: current || " ",
  });
  return s ? `### SYSTEM\n${s}\n\n${body}` : body;
}

/** Păstrează sfârșitul promptului (mesaje recente). */
export function trimPromptEnd(fullPrompt: string): { text: string; truncated: boolean } {
  const max = maxContextChars();
  if (fullPrompt.length <= max) {
    return { text: fullPrompt, truncated: false };
  }
  const slice = fullPrompt.slice(fullPrompt.length - max);
  return {
    text: `[...context truncated to ${max} chars...]\n\n${slice}`,
    truncated: true,
  };
}
