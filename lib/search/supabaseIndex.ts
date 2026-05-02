/**
 * Supabase Search Engine - Indexare în Supabase
 * Folosește căutare bazată pe Supabase full-text search
 */

import { Product, SearchResult, SearchEngine } from './types';
import { supabaseAdmin } from '@/lib/supabase';
import { searchProductsFts, logProductSearch, FTS_QUERY_MAX_LENGTH } from './fts';

export class SupabaseSearchEngine implements SearchEngine {
  private lastIndexed?: Date;

  /**
   * Caută produse după query
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    if (!supabaseAdmin) {
      console.warn('[SupabaseSearchEngine] Supabase admin client not available');
      return [];
    }

    try {
      const qSafe = query.trim().slice(0, FTS_QUERY_MAX_LENGTH);
      const queryLower = qSafe.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);

      if (queryWords.length === 0) {
        return [];
      }

      // 1) FTS (ts_rank_cd, prefix :* în RPC) — logging în searchProductsFts
      const ftsResults = await searchProductsFts(qSafe, {}, limit);
      if (ftsResults.length > 0) {
        return ftsResults;
      }

      // 2) Doar dacă FTS = 0 rezultate: ILIKE + scor manual
      const tFallback = Date.now();

      let supabaseQuery = supabaseAdmin
        .from('products')
        .select('id, title, description, category, subcategory, starting_price_ron, images, url, slug, status, approval_status')
        .or(queryWords.map(word => `title.ilike.%${word}%,description.ilike.%${word}%,category.ilike.%${word}%,subcategory.ilike.%${word}%`).join(','))
        .in('status', ['active', 'reserved'])
        .eq('approval_status', 'approved')
        .not('title', 'is', null)
        .not('description', 'is', null)
        .limit(limit * 2); // Caută mai multe pentru a filtra după score

      const { data: products, error } = await supabaseQuery;

      if (error) {
        console.error('[SupabaseSearchEngine] Search error:', error);
        return [];
      }

      if (!products || products.length === 0) {
        logProductSearch({
          query: qSafe,
          resultsCount: 0,
          source: "ilike_fallback",
          durationMs: Date.now() - tFallback,
        });
        return [];
      }

      // Calculează score pentru fiecare produs
      const scored: Array<{ product: any; score: number }> = [];

      for (const product of products) {
        let score = 0;

        const title = (product.title || '').toLowerCase();
        const description = (product.description || '').toLowerCase();
        const category = (product.category || '').toLowerCase();
        const subcategory = (product.subcategory || '').toLowerCase();

        // Caută în titlu (cel mai important)
        for (const word of queryWords) {
          if (title.includes(word)) {
            score += 10;
            // Bonus pentru match exact
            if (title === queryLower) {
              score += 20;
            } else if (title.startsWith(queryLower)) {
              score += 10;
            }
          }
        }

        // Caută în descriere
        for (const word of queryWords) {
          if (description.includes(word)) {
            score += 3;
          }
        }

        // Caută în categorie
        for (const word of queryWords) {
          if (category.includes(word) || subcategory.includes(word)) {
            score += 5;
          }
        }

        // Bonus pentru match complet al query-ului
        if (title.includes(queryLower) || description.includes(queryLower)) {
          score += 5;
        }

        if (score > 0) {
          scored.push({ product, score });
        }
      }

      // Sortează după score (descrescător)
      scored.sort((a, b) => b.score - a.score);

      // Limitează rezultatele
      const limited = scored.slice(0, limit);

      logProductSearch({
        query: qSafe,
        resultsCount: limited.length,
        source: "ilike_fallback",
        durationMs: Date.now() - tFallback,
      });

      // Transformă în SearchResult
      return limited.map(({ product, score }) => {
        const imageUrl = product.images && Array.isArray(product.images) && product.images.length > 0
          ? product.images[0]
          : product.images || undefined;

        const url = product.url || (product.slug ? `/${product.slug}` : undefined);

        return {
          id: product.id,
          title: product.title,
          description: product.description || '',
          category: product.category,
          price: product.starting_price_ron,
          image: imageUrl,
          url,
          score: score / 100, // Normalizează score-ul la 0-1
          type: 'product' as const,
          metadata: {
            subcategory: product.subcategory,
            currency: 'RON',
            search_source: 'ilike_fallback' as const,
          },
        };
      });
    } catch (error) {
      console.error('[SupabaseSearchEngine] Error:', error);
      return [];
    }
  }

  /**
   * Indexează produse
   * Notă: Supabase nu necesită indexare explicită, dar putem marca timestamp-ul
   */
  async index(products: Product[]): Promise<void> {
    this.lastIndexed = new Date();
    // Supabase indexează automat când produsele sunt în baza de date
    // Aici doar marcăm timestamp-ul
  }

  /**
   * Curăță indexul
   * Notă: Nu ștergem produsele din Supabase, doar resetăm timestamp-ul
   */
  async clear(): Promise<void> {
    this.lastIndexed = undefined;
  }

  /**
   * Obține statistici despre index
   */
  async getStats(): Promise<{ totalProducts: number; lastIndexed?: Date }> {
    if (!supabaseAdmin) {
      return {
        totalProducts: 0,
        lastIndexed: this.lastIndexed,
      };
    }

    try {
      const { count, error } = await supabaseAdmin
        .from('products')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'reserved'])
        .eq('approval_status', 'approved');

      if (error) {
        console.error('[SupabaseSearchEngine] Stats error:', error);
        return {
          totalProducts: 0,
          lastIndexed: this.lastIndexed,
        };
      }

      return {
        totalProducts: count || 0,
        lastIndexed: this.lastIndexed,
      };
    } catch (error) {
      console.error('[SupabaseSearchEngine] Stats error:', error);
      return {
        totalProducts: 0,
        lastIndexed: this.lastIndexed,
      };
    }
  }
}

/**
 * Creează un SupabaseSearchEngine
 */
export function createSupabaseSearchEngine(): SupabaseSearchEngine {
  return new SupabaseSearchEngine();
}


