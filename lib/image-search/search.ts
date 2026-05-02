/**
 * Pinecone search and reranking utilities
 */

import { queryVectors } from '@/lib/pinecone';
import { generateEmbedding } from '@/utils/embeddings';
import { VisionProductQuery, PineconeMatch, SimilarProduct } from './types';

/**
 * Creates embedding from text
 * Uses 1536 dimensions for compatibility with existing Pinecone index
 */
export async function embedText(text: string, dimensions: number = 1536): Promise<number[]> {
  return generateEmbedding(text, dimensions);
}

/**
 * Searches Pinecone with vector and optional filters
 */
export async function pineconeSearch(
  vector: number[],
  topK: number = 40,
  filter?: Record<string, any>
): Promise<PineconeMatch[]> {
  try {
    const results = await queryVectors(vector, topK, filter);
    
    return results.map((match: any) => {
      // Support both formats: productId (new) and id (existing)
      const productId = match.metadata?.productId || match.metadata?.id || '';
      
      // Extract product ID from vector ID if needed (format: product_xxx or product:xxx)
      const extractedId = productId || 
        (match.id?.startsWith('product_') ? match.id.replace('product_', '') : null) ||
        (match.id?.startsWith('product:') ? match.id.replace('product:', '') : null) ||
        match.id || '';
      
      return {
        id: match.id,
        score: match.score || 0,
        metadata: {
          productId: extractedId,
          title: match.metadata?.title || null,
          image: match.metadata?.image || null,
          price: match.metadata?.price || match.metadata?.starting_price_ron || null,
          brand: match.metadata?.brand || null,
          category: match.metadata?.category || null,
          ...match.metadata,
        },
      };
    });
  } catch (error: any) {
    console.error('[Pinecone Search] Error:', error);
    throw new Error(`Pinecone search failed: ${error.message}`);
  }
}

/**
 * Reranks and deduplicates matches based on extracted query
 */
export function rerankAndDedup(
  matches: PineconeMatch[],
  extracted: VisionProductQuery
): SimilarProduct[] {
  // Deduplicate by productId
  const productMap = new Map<string, PineconeMatch>();
  
  for (const match of matches) {
    const productId = match.metadata.productId;
    if (!productId) continue;
    
    const existing = productMap.get(productId);
    if (!existing || match.score > existing.score) {
      productMap.set(productId, match);
    }
  }

  // Convert to array and apply reranking
  const deduped = Array.from(productMap.values());

  // Apply boosts and penalties
  const reranked = deduped.map(match => {
    let adjustedScore = match.score;

    // Boost: brand match (case-insensitive)
    if (extracted.attributes.brand && match.metadata.brand) {
      const extractedBrand = extracted.attributes.brand.toLowerCase().trim();
      const matchBrand = match.metadata.brand.toLowerCase().trim();
      
      if (extractedBrand === matchBrand) {
        adjustedScore += 0.05; // Boost by 0.05
      }
    }

    // Penalty: different category if category confidence is high
    if (extracted.confidence.category >= 0.7) {
      if (extracted.attributes.category && match.metadata.category) {
        const extractedCat = extracted.attributes.category.toLowerCase().trim();
        const matchCat = match.metadata.category.toLowerCase().trim();
        
        if (extractedCat !== matchCat) {
          adjustedScore -= 0.1; // Penalty of 0.1
        }
      }
    }

    return {
      ...match,
      score: Math.max(0, Math.min(1, adjustedScore)), // Clamp to [0, 1]
    };
  });

  // Sort by adjusted score (descending)
  reranked.sort((a, b) => b.score - a.score);

  // Keep top 24
  const top24 = reranked.slice(0, 24);

  // Convert to SimilarProduct format
  return top24.map(match => ({
    productId: match.metadata.productId,
    score: match.score,
    title: match.metadata.title || null,
    image: match.metadata.image || null,
    price: match.metadata.price || null,
    brand: match.metadata.brand || null,
    category: match.metadata.category || null,
  }));
}

/**
 * Determines match status based on scores and extracted identifiers
 */
export function determineMatchStatus(
  similars: SimilarProduct[],
  extracted: VisionProductQuery
): { status: 'exact' | 'candidate' | 'none'; productId: string | null; score: number | null } {
  if (similars.length === 0) {
    return { status: 'none', productId: null, score: null };
  }

  const top1 = similars[0];
  const top2 = similars[1];

  // If identifiers present, try exact match logic
  // Lower threshold for text-based embeddings
  if (extracted.identifiers.model_code || extracted.identifiers.sku_text) {
    // If top1 score is high and brand matches, treat as exact
    if (top1.score >= 0.75) {
      const brandMatch = extracted.attributes.brand && top1.brand
        ? extracted.attributes.brand.toLowerCase().trim() === top1.brand.toLowerCase().trim()
        : false;
      
      if (brandMatch || !extracted.attributes.brand) {
        return { status: 'exact', productId: top1.productId, score: top1.score };
      }
    }
  }

  // Standard logic - lower thresholds for text-based embeddings
  const scoreDiff = top2 ? top1.score - top2.score : 0.1;
  const brandMatch = extracted.attributes.brand && top1.brand
    ? extracted.attributes.brand.toLowerCase().trim() === top1.brand.toLowerCase().trim()
    : false;
  const brandConfident = extracted.confidence.brand >= 0.6;

  // Exact: high score + good gap + brand match (if brand confidence high)
  // Lower thresholds because embeddings are text-based, not image-based
  if (top1.score >= 0.80 && scoreDiff >= 0.02) {
    if (!brandConfident || brandMatch || !extracted.attributes.brand) {
      return { status: 'exact', productId: top1.productId, score: top1.score };
    }
  }

  // Candidate: good score (lower threshold for text embeddings)
  if (top1.score >= 0.70) {
    return { status: 'candidate', productId: top1.productId, score: top1.score };
  }

  // None - but still return similars even if score is lower
  // This allows showing results even with lower similarity
  if (top1.score >= 0.60) {
    return { status: 'candidate', productId: top1.productId, score: top1.score };
  }

  return { status: 'none', productId: null, score: null };
}
