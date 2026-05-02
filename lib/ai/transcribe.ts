import { toFile } from 'openai/uploads';
import { getOpenAIClient } from './openai';

export async function transcribeAudioBuffer(buffer: Buffer, filename: string): Promise<string> {
  const openai = getOpenAIClient();

  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(buffer, filename),
    model: 'whisper-1',
    language: 'ro',
    response_format: 'json',
  });

  if (!transcription.text) {
    throw new Error('Transcrierea nu a produs text.');
  }

  return transcription.text.trim();
}










