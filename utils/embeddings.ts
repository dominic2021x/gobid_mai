import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Embeddings Service - OpenAI text-embedding-3-small (1536) / text-embedding-3-large (3072)
 * Folosește text-embedding-3-small (1536) pentru compatibilitate cu indexul existent
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * Generează embedding pentru un text folosind OpenAI
 * Folosește text-embedding-3-small (1536) pentru compatibilitate cu indexul existent
 */
export async function generateEmbedding(text: string, dimensions: number = 1536): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Clean text
  const cleanText = text
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 8000);

  // Use text-embedding-3-small for 1536 dimensions, text-embedding-3-large for 3072
  const model = dimensions === 3072 ? 'text-embedding-3-large' : 'text-embedding-3-small';
  const embeddingDimensions = dimensions === 3072 ? 3072 : 1536;

  try {
    const response = await openai.embeddings.create({
      model: model,
      input: cleanText,
      dimensions: embeddingDimensions,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding returned from OpenAI');
    }

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generează embeddings pentru multiple texte
 * Folosește text-embedding-3-small (1536) pentru compatibilitate cu indexul existent
 */
export async function generateEmbeddingsBatch(texts: string[], dimensions: number = 1536): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Use text-embedding-3-small for 1536 dimensions, text-embedding-3-large for 3072
  const model = dimensions === 3072 ? 'text-embedding-3-large' : 'text-embedding-3-small';
  const embeddingDimensions = dimensions === 3072 ? 3072 : 1536;

  try {
    const response = await openai.embeddings.create({
      model: model,
      input: texts.map(text => text.trim().substring(0, 8000)),
      dimensions: embeddingDimensions,
    });

    return response.data.map(item => item.embedding);
  } catch (error: any) {
    console.error('Error generating batch embeddings:', error);
    throw new Error(`Failed to generate batch embeddings: ${error.message}`);
  }
}

/**
 * Generează embedding pentru un produs complet
 */
export async function generateProductEmbedding(product: {
  title: string;
  description?: string;
  category?: string;
  location?: string;
  price?: number;
  specifications?: Record<string, any>;
}): Promise<number[]> {
  // Construiește text complet pentru embedding
  const textParts = [
    product.title,
    product.description || '',
    product.category ? `Categorie: ${product.category}` : '',
    product.location ? `Locație: ${product.location}` : '',
    product.price ? `Preț: ${product.price} Lei` : '',
    product.specifications 
      ? `Specificații: ${JSON.stringify(product.specifications)}`
      : '',
  ];

  const fullText = textParts.filter(Boolean).join('. ');
  
  return generateEmbedding(fullText);
}

