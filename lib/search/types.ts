/**
 * Tipuri pentru Search Engine
 */

export interface Product {
  id: string;
  title: string;
  description?: string;
  category?: string;
  subcategory?: string;
  price?: number;
  currency?: string;
  image?: string;
  url?: string;
  slug?: string;
  [key: string]: any;
}

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  category?: string;
  price?: number;
  image?: string;
  url?: string;
  score: number;
  type: 'product' | 'page';
  metadata?: Record<string, any>;
}

export interface SearchEngine {
  /**
   * Caută produse după query
   */
  search(query: string, limit?: number): Promise<SearchResult[]>;
  
  /**
   * Indexează produse
   */
  index(products: Product[]): Promise<void>;
  
  /**
   * Curăță indexul
   */
  clear(): Promise<void>;
  
  /**
   * Obține statistici despre index
   */
  getStats(): Promise<{ totalProducts: number; lastIndexed?: Date }>;
}


