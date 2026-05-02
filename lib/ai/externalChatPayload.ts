/** Body pentru POST /api/ai (proxy Mac mini / backend extern). */

import type { ChatMessage } from '@/lib/assistant/llm/provider';
import { DEFAULT_AI_CHAT_SYSTEM } from '@/lib/ai/aiChatSystemPrompt';

export { DEFAULT_AI_CHAT_SYSTEM };
import { buildStructuredChatPrompt } from '@/lib/ai/chatPromptFormat';
import {
  pickRemoteModelForPrompt,
  isBlockedHeavyModel,
  DEFAULT_ASSISTANT_AI_MODEL_FAST,
} from '@/lib/ai/assistantRemoteModelRouter';

export type ChatTurn = { role: string; content: string };

export function buildProxiedAiChatBody(params: {
  userMessage: string;
  conversationHistory: ChatTurn[];
  system?: string;
  model?: string;
}): { prompt: string; system: string; model: string } {
  const prompt = buildStructuredChatPrompt({
    conversationHistory: params.conversationHistory,
    currentUserMessage: params.userMessage,
  });

  const system = params.system?.trim() || DEFAULT_AI_CHAT_SYSTEM;
  const totalLen = prompt.length + system.length;
  const combinedForRouting = `${system}\n${prompt}`;

  let model = params.model?.trim();
  if (!model && typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AI_CHAT_MODEL?.trim()) {
    model = process.env.NEXT_PUBLIC_AI_CHAT_MODEL.trim();
  }
  if (!model) {
    model = pickRemoteModelForPrompt(totalLen, combinedForRouting);
  }
  if (isBlockedHeavyModel(model)) {
    model = DEFAULT_ASSISTANT_AI_MODEL_FAST;
  }

  return {
    prompt,
    system,
    model,
  };
}

/** Convertește mesajele Asistentului (system + istoric) în body pentru Mac mini / EXTERNAL_AI. */
export function buildExternalProxyBodyFromAssistantMessages(
  messages: ChatMessage[]
): { prompt: string; system: string; model: string } {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const system = systemMsgs.join('\n\n').trim() || DEFAULT_AI_CHAT_SYSTEM;

  const rest = messages.filter((m) => m.role !== 'system');
  if (rest.length === 0) {
    const model = pickRemoteModelForPrompt(system.length, system);
    return { prompt: ' ', system, model };
  }

  const last = rest[rest.length - 1]!;
  const history = rest.slice(0, -1);
  const userLine = last.role === 'user' ? last.content : `${last.role}: ${last.content}`;
  const prompt = buildStructuredChatPrompt({
    conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
    currentUserMessage: userLine,
  });

  const totalLen = prompt.length + system.length;
  const combinedForRouting = `${system}\n${prompt}`;
  let model =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AI_CHAT_MODEL?.trim()) || '';
  if (!model) {
    model = pickRemoteModelForPrompt(totalLen, combinedForRouting);
  }
  if (isBlockedHeavyModel(model)) {
    model = DEFAULT_ASSISTANT_AI_MODEL_FAST;
  }

  return { prompt, system, model };
}

export function assistantTextFromProxiedResponse(data: unknown): string {
  if (data == null) return 'Nu pot răspunde momentan.';
  if (typeof data === 'string') return data.trim() || 'Nu pot răspunde momentan.';
  if (typeof data !== 'object') return 'Nu pot răspunde momentan.';

  const o = data as Record<string, unknown>;

  if (
    typeof o.error === 'string' &&
    o.message == null &&
    o.response == null &&
    o.content == null
  ) {
    return `Eroare: ${o.error}`;
  }

  if (typeof o.response === 'string' && o.response.trim()) return o.response.trim();

  if (typeof o.message === 'string') return o.message.trim() || 'Nu pot răspunde momentan.';
  if (o.message && typeof o.message === 'object') {
    const inner = (o.message as Record<string, unknown>).content;
    if (typeof inner === 'string') return inner.trim() || 'Nu pot răspunde momentan.';
  }

  for (const key of ['content', 'text', 'answer'] as const) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  return 'Nu pot răspunde momentan.';
}
