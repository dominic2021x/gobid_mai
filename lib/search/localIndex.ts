/**
 * Local Search Engine - Indexare în memorie
 * Folosește căutare simplă bazată pe text matching
 */

import { Product, SearchResult, SearchEngine } from './types';

export class LocalSearchEngine implements SearchEngine {
  private products: Product[] = [];
  private lastIndexed?: Date;

  /**
   * Caută produse după query
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    if (this.products.length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);

    if (queryWords.length === 0) {
      return [];
    }

    // Calculează score pentru fiecare produs
    const scored: Array<{ product: Product; score: number }> = [];

    for (const product of this.products) {
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

    // Transformă în SearchResult
    return limited.map(({ product, score }) => ({
      id: product.id,
      title: product.title,
      description: product.description || '',
      category: product.category,
      price: product.price,
      image: product.image,
      url: product.url || product.slug ? `/${product.slug}` : undefined,
      score: score / 100, // Normalizează score-ul la 0-1
      type: 'product' as const,
      metadata: {
        subcategory: product.subcategory,
        currency: product.currency,
      },
    }));
  }

  /**
   * Indexează produse
   */
  async index(products: Product[]): Promise<void> {
    this.products = products;
    this.lastIndexed = new Date();
  }

  /**
   * Curăță indexul
   */
  async clear(): Promise<void> {
    this.products = [];
    this.lastIndexed = undefined;
  }

  /**
   * Obține statistici despre index
   */
  async getStats(): Promise<{ totalProducts: number; lastIndexed?: Date }> {
    return {
      totalProducts: this.products.length,
      lastIndexed: this.lastIndexed,
    };
  }
}

/**
 * Creează un LocalSearchEngine și îl indexează cu produse
 */
export function createLocalSearchEngine(products: Product[]): LocalSearchEngine {
  const engine = new LocalSearchEngine();
  engine.index(products);
  return engine;
}
