import { getOpenAIClient } from './openai';
import { getPineconeIndex } from './pinecone';
import { createEmbedding } from './embeddings';

const DEFAULT_TOP_K = 10;
const NORMALIZE_MODEL = 'gpt-4o-mini';

/**
 * Normalizează interogarea utilizatorului (corecturi, sinonime) folosind GPT-4o.
 */
export async function normalizeQuery(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Interogarea este goală.');
  }

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: NORMALIZE_MODEL,
    input: [
      {
        role: 'system',
        content:
          'Ești un asistent care normalizează interogările de căutare pentru un magazin online din România. Corectezi greșelile și adaugi sinonime relevante în limba română.',
      },
      {
        role: 'user',
        content: `Normalizează această interogare pentru o căutare semantică:\n\n${trimmed}`,
      },
    ],
  });

  const output = response.output?.[0];
  if (!output || output.type !== 'message' || output.role !== 'assistant') {
    return trimmed;
  }

  const textPart = output.content?.find((part) => part.type === 'output_text');
  if (textPart && textPart.type === 'output_text' && textPart.text.trim()) {
    return textPart.text.trim();
  }

  return trimmed;
}

export interface SemanticSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Rulează o căutare semantică în indexul Pinecone pe baza unei interogări.
 */
export async function semanticSearch(
  query: string,
  options: { topK?: number } = {}
): Promise<SemanticSearchResult[]> {
  const normalized = await normalizeQuery(query);
  const vector = await createEmbedding(normalized);

  const index = getPineconeIndex();
  const topK = options.topK ?? DEFAULT_TOP_K;

  const response = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (
    response.matches?.map((match) => ({
      id: match.id ?? '',
      score: match.score ?? 0,
      metadata: (match.metadata as Record<string, unknown>) ?? {},
    })) ?? []
  );
}










