import { getOpenAIClient } from './openai';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const MAX_BATCH_SIZE = 50;

/**
 * Împarte array-ul în bucăți mai mici pentru a respecta limitele API-ului.
 */
function chunkArray<T>(input: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

/**
 * Creează embedding pentru o listă de texte folosind OpenAI.
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const client = getOpenAIClient();
  const chunks = chunkArray(texts, MAX_BATCH_SIZE);
  const embeddings: number[][] = [];

  for (const chunk of chunks) {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunk,
    });

    if (!response.data || response.data.length !== chunk.length) {
      throw new Error('Dimensiune embedding inconsistentă primită de la OpenAI.');
    }

    response.data.forEach((item) => {
      embeddings.push(item.embedding);
    });
  }

  return embeddings;
}

/**
 * Creează embedding pentru un singur text.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const [embedding] = await createEmbeddings([text]);
  if (!embedding) {
    throw new Error('Nu am putut genera embedding pentru textul furnizat.');
  }
  return embedding;
}
/**
 * Embeddings Service - Local Sentence Transformers
 * Folosește Xenova Transformers pentru embeddings locale (gratuit)
 */

import { pipeline } from '@xenova/transformers';

let embedder: any = null;

/**
 * Inițializează modelul de embeddings (lazy loading)
 */
export async function initializeEmbeddings() {
  if (!embedder) {
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        quantized: true, // Folosește versiunea cuantizată pentru viteza mai mare
      }
    );
  }
  return embedder;
}

/**
 * Generează embeddings pentru un text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initializeEmbeddings();
  
  if (!model) {
    throw new Error('Embeddings model not initialized');
  }

  // Clean text - elimină caractere speciale și normalizează
  const cleanText = text
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 512); // Limitează la 512 caractere pentru model

  try {
    const output = await model(cleanText, {
      pooling: 'mean',
      normalize: true,
    });

    // Extrage vectorul de embeddings
    const embedding = Array.from(output.data) as number[];
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generează embeddings pentru mai multe texte (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = await Promise.all(
    texts.map(text => generateEmbedding(text))
  );
  return embeddings;
}



