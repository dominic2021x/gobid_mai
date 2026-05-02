/**
 * Builds a compact conversation summary (deterministic, no LLM) for context window.
 * Used every 20 messages; result stored in assistant_state.summary.
 */

const MAX_SUMMARY_CHARS = 600;
const MAX_MESSAGE_CHARS = 80;

export type MessageForSummary = { role: string; content: string };

/**
 * Returns a short summary string from a slice of messages.
 * No PII or secrets; role + truncated content only.
 */
export function buildCompactSummary(messages: MessageForSummary[]): string {
  if (messages.length === 0) return "";
  const parts: string[] = [];
  let len = 0;
  for (const m of messages) {
    const role = m.role === "user" ? "U" : "A";
    const content = (m.content ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
    const line = `${role}: ${content}`;
    if (len + line.length + 1 > MAX_SUMMARY_CHARS) break;
    parts.push(line);
    len += line.length + 1;
  }
  return parts.join("\n");
}
