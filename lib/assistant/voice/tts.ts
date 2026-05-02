/**
 * TTS for assistant voice mode. Română; mp3 output as base64.
 * Server-side only. Uses OPENAI_API_KEY (OpenAI TTS).
 * Voce "shimmer" – caldă și prietenoasă.
 */

import { getOpenAIClient } from "@/lib/ai/openai";

/**
 * Convertește text la vorbire (română). Returnează mp3 base64 sau null la eroare.
 */
export async function textToSpeechBase64(text: string): Promise<string | null> {
  if (!text || text.length > 4096) return null;
  try {
    const openai = getOpenAIClient();
    const response = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: "shimmer",
      input: text,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
  } catch {
    return null;
  }
}
