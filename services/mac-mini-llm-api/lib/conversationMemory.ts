export type ChatTurn = { role: "user" | "assistant"; content: string };

const memory = new Map<string, ChatTurn[]>();

function maxMessages(): number {
  const n = parseInt(process.env.CONVERSATION_MAX_MESSAGES ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 6;
}

export function getConversation(conversationId: string): ChatTurn[] {
  return memory.get(conversationId) ?? [];
}

export function setConversation(conversationId: string, turns: ChatTurn[]): void {
  const cap = maxMessages();
  memory.set(conversationId, turns.length > cap ? turns.slice(-cap) : turns);
}

export function appendUserMessage(conversationId: string, content: string): ChatTurn[] {
  const prev = getConversation(conversationId);
  const next = [...prev, { role: "user" as const, content }];
  const cap = maxMessages();
  const trimmed = next.length > cap ? next.slice(-cap) : next;
  memory.set(conversationId, trimmed);
  return trimmed;
}

export function appendAssistantMessage(conversationId: string, content: string): void {
  const prev = getConversation(conversationId);
  const next = [...prev, { role: "assistant" as const, content }];
  const cap = maxMessages();
  memory.set(conversationId, next.length > cap ? next.slice(-cap) : next);
}
