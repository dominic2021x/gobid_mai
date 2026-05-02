/**
 * Utility functions for AI system
 */

/**
 * Extrage text curat dintr-un HTML (pentru indexare pagini)
 */
export function extractTextFromHTML(html: string): string {
  // Elimină tag-urile HTML
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ');
  text = text.trim();
  
  return text;
}

/**
 * Normalizează text pentru embeddings (elimină caractere speciale, normalizează)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u0103\u00e2\u00ee\u015f\u0163\u0103\u00e2\u00ee\u015f\u0163]/g, '') // Păstrează diacritice românești
    .substring(0, 512);
}

/**
 * Calculează similaritatea între două vectori (cosine similarity)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Returnează un ID unic pentru documente
 */
export function generateDocumentId(prefix: string = 'doc'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

















