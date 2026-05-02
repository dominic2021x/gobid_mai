import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

/**
 * Returnează instanța unică OpenAI configurată cu cheia din mediu.
 */
export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Lipsește variabila de mediu OPENAI_API_KEY.');
  }

  openaiClient = new OpenAI({
    apiKey,
  });

  return openaiClient;
}










