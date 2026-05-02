/**
 * RAG (Retrieval-Augmented Generation) Service
 * Combină embeddings, căutare în Supabase și generare răspunsuri
 * Folosește sistemul modular de indexare (local sau Supabase)
 */

import { generateEmbedding } from './embeddings';
import { supabaseAdmin } from '@/lib/supabase';
import { searchProducts } from '@/lib/search';

export interface RAGResult {
  answer: string;
  sources: Array<{
    text: string;
    source: string;
    score: number;
  }>;
  context: string;
}

export interface SearchResult {
  id: string;
  text: string;
  source: string;
  type: 'product' | 'page' | 'ticket';
  metadata?: Record<string, any>;
  score: number;
}

/**
 * Caută informații relevante pentru o întrebare
 * Detectează automat tipul întrebării și caută în colecțiile corespunzătoare
 */
export async function retrieveContext(
  query: string,
  collectionName?: string,
  limit: number = 5
): Promise<SearchResult[]> {
  try {
    // Folosește sistemul modular de indexare (local sau Supabase)
    try {
      const results = await searchProducts(query, limit);
      
      // Transformă rezultatele în formatul așteptat
      return results.map((result) => ({
        id: result.id,
        text: `${result.title || ''}. ${result.description || ''}`.trim(),
        source: result.url || `/licitatii-publice/${result.id}`,
        type: 'product' as const,
        metadata: {
          title: result.title,
          description: result.description,
          category: result.category,
          subcategory: (result as any).subcategory,
          price: result.price,
          image: result.image,
          url: result.url,
        },
        score: result.score,
      }));
    } catch (searchError) {
      console.warn('Search engine error, falling back to direct Supabase query:', searchError);
      
      // Fallback la căutare directă în Supabase
      if (!supabaseAdmin) {
        console.warn('Supabase not available, returning empty results');
        return [];
      }

      const lowerQuery = query.toLowerCase();
      
      const { data: products, error } = await supabaseAdmin
        .from('products')
        .select('id, title, description, category, subcategory, starting_price_ron, images, url, slug, status, approval_status')
        .or(`title.ilike.%${lowerQuery}%,description.ilike.%${lowerQuery}%,category.ilike.%${lowerQuery}%,subcategory.ilike.%${lowerQuery}%`)
        .or('status.eq.active,approval_status.eq.approved')
        .not('title', 'is', null)
        .not('description', 'is', null)
        .limit(limit * 2);

      if (error) {
        console.error('Supabase search error:', error);
        return [];
      }

      // Transformă rezultatele din Supabase - DOAR PRODUSE
      if (products && products.length > 0) {
        const searchResults: SearchResult[] = products.map((product: any) => {
          // Calculează score bazat pe relevanță text
          const titleMatch = product.title?.toLowerCase().includes(lowerQuery) ? 0.8 : 0;
          const descMatch = product.description?.toLowerCase().includes(lowerQuery) ? 0.5 : 0;
          const categoryMatch = product.category?.toLowerCase().includes(lowerQuery) ? 0.3 : 0;
          const subcategoryMatch = product.subcategory?.toLowerCase().includes(lowerQuery) ? 0.2 : 0;
          const score = Math.min(titleMatch + descMatch + categoryMatch + subcategoryMatch, 1.0);

          // Construiește text pentru context
          const text = `${product.title || ''}. ${product.description || ''}`.trim();
          const source =
            (typeof product.url === 'string' && product.url.length > 0)
              ? product.url
              : (typeof product.slug === 'string' && product.slug.length > 0)
              ? `/licitatii-publice/${product.slug}`
              : `/licitatii-publice/${product.id}`;

          // Extrage prima imagine
          const imageUrl = Array.isArray(product.images) && product.images.length > 0
            ? (typeof product.images[0] === 'string' ? product.images[0] : product.images[0]?.url)
            : null;

          return {
            id: product.id?.toString() || '',
            text: text,
            source: source || 'unknown',
            type: 'product' as const,
            metadata: {
              title: product.title,
              description: product.description,
              category: product.category,
              subcategory: product.subcategory,
              price: product.starting_price_ron,
              image: imageUrl,
              url: source,
            },
            score: score,
          };
        });

        // Sortează după scor și returnează cele mai bune
        const sortedResults = searchResults.sort((a, b) => b.score - a.score);
        const bestResults = sortedResults.slice(0, limit);

        return bestResults;
      }

      // Dacă nu există produse, returnează array gol (NU pagini statice)
      return [];
    }
  } catch (error) {
    console.error('Error retrieving context:', error);
    return [];
  }
}

/**
 * Construiește contextul pentru LLM din rezultatele căutării
 */
export function buildContext(searchResults: SearchResult[]): string {
  if (searchResults.length === 0) {
    return 'Nu s-a găsit context relevant pentru această întrebare.';
  }

  // Folosește doar rezultatele relevante (score > 0.5)
  const relevantResults = searchResults.filter(r => r.score > 0.5);
  
  if (relevantResults.length === 0 && searchResults.length > 0) {
    // Dacă toate au scor mic, folosește cel mai bun
    const bestResult = searchResults[0];
    return bestResult.text;
  }

  // Construiește context din rezultatele relevante
  const contextParts = relevantResults.slice(0, 3).map((result) => {
    return result.text; // Doar textul, fără formatare complexă
  });

  return contextParts.join(' ');
}

/**
 * Generează prompt pentru LLM cu context
 */
export function buildPrompt(query: string, context: string, systemPrompt?: string): string {
  // Încarcă configurația personalizată dacă e disponibilă
  let customSystemPrompt = systemPrompt;
  
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('aiResponseConfig');
      if (saved) {
        const config = JSON.parse(saved);
        customSystemPrompt = config.systemPrompt || systemPrompt;
      }
    } catch (e) {
      // Ignore errors
    }
  }

  const defaultSystemPrompt = `Ești un asistent virtual pentru platforma de licitații gobid.ro.
Răspunde în limba română, fiind util, prietenos și concis.
Folosește DOAR informațiile din contextul furnizat pentru a răspunde.
Dacă contextul nu conține informații relevante, spune că nu știi și sugerează să contacteze suportul.`;

  const system = customSystemPrompt || defaultSystemPrompt;

  // Construiește prompt-ul cu separator clar
  return `${system}

Context relevant:
${context || 'Nu s-a găsit context relevant pentru această întrebare.'}

Întrebare utilizator: ${query}

Răspuns:`;
}

/**
 * Analizează dacă întrebarea necesită suport uman
 */
export function shouldEscalateToHuman(query: string, searchResults: SearchResult[]): boolean {
  // Dacă nu s-au găsit rezultate relevante (scor mic)
  if (searchResults.length === 0 || searchResults[0].score < 0.5) {
    return true;
  }

  // Cuvinte cheie care indică nevoie de suport uman
  const escalationKeywords = [
    'eroare',
    'problema',
    'nu funcționează',
    'ajutor',
    'suport',
    'complain',
    'reclamație',
  ];

  const lowerQuery = query.toLowerCase();
  return escalationKeywords.some(keyword => lowerQuery.includes(keyword));
}

