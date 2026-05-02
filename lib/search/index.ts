/**
 * Search Module - Exportă funcții de căutare
 * Folosește sistemul modular de indexare (local sau Supabase)
 */

import { SearchResult } from './types';
import { createSupabaseSearchEngine } from './supabaseIndex';

// Cache pentru search engine instance
let searchEngineInstance: ReturnType<typeof createSupabaseSearchEngine> | null = null;

/**
 * Obține sau creează instanța search engine
 */
function getSearchEngine() {
  if (!searchEngineInstance) {
    searchEngineInstance = createSupabaseSearchEngine();
  }
  return searchEngineInstance;
}

/**
 * Caută produse după query
 * @param query - Query-ul de căutare
 * @param limit - Numărul maxim de rezultate (default: 20)
 * @returns Array de SearchResult
 */
export async function searchProducts(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  try {
    const engine = getSearchEngine();
    return await engine.search(query, limit);
  } catch (error) {
    console.error('[searchProducts] Error:', error);
    return [];
  }
}

// Exportă tipurile și clasele pentru utilizare în alte module
export type { Product, SearchResult, SearchEngine } from './types';
export { LocalSearchEngine, createLocalSearchEngine } from './localIndex';
export { SupabaseSearchEngine, createSupabaseSearchEngine } from './supabaseIndex';
export {
  searchProductsFts,
  buildProductListingPath,
  logProductSearch,
  getSearchDurationPercentilesMs,
  FTS_QUERY_MAX_LENGTH,
  type ProductFtsFilters,
} from './fts';
