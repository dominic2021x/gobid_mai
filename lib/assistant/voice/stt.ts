/**
 * STT for assistant voice mode. Whisper, română; detectează limba pentru validare.
 * Server-side only. Uses OPENAI_API_KEY.
 */

import { toFile } from "openai/uploads";
import { getOpenAIClient } from "@/lib/ai/openai";

const STT_TIMEOUT_MS = 15_000;

export type SttResult = {
  text: string;
  /** Limba detectată (ex. "ro", "en"). Dacă nu e "ro", API-ul returnează mesaj doar-română. */
  detectedLanguage: string;
};

/**
 * Transcribe audio cu Whisper. language: "ro", returnează text + limba detectată (verbose_json).
 */
export async function transcribeForAssistant(buffer: Buffer, filename: string): Promise<SttResult> {
  const openai = getOpenAIClient();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const transcription = await openai.audio.transcriptions.create(
      {
        file: await toFile(buffer, filename),
        model: "whisper-1",
        language: "ro",
        temperature: 0,
        response_format: "verbose_json",
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const text = (transcription as { text?: string }).text ?? "";
    const detectedLanguage = ((transcription as { language?: string }).language ?? "ro").toLowerCase();
    return { text: text.trim(), detectedLanguage };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error("Transcrierea a eșuat.");
  }
}
