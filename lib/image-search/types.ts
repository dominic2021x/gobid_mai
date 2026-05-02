/**
 * Types for image search functionality
 */

export interface VisionProductQuery {
  caption: string;
  attributes: {
    category: string | null;
    brand: string | null;
    color: string | null;
    material: string | null;
    pattern: string | null;
    gender: string | null;
    key_details: string[];
  };
  identifiers: {
    model_code: string | null;
    sku_text: string | null;
    visible_text: string | null;
  };
  confidence: {
    category: number;
    brand: number;
    overall: number;
  };
}

export interface ImageSearchMatch {
  status: 'exact' | 'candidate' | 'none';
  productId: string | null;
  score: number | null;
}

export interface SimilarProduct {
  productId: string;
  score: number;
  title: string | null;
  image: string | null;
  price: number | null;
  brand: string | null;
  category: string | null;
}

export interface ImageSearchResponse {
  query: VisionProductQuery;
  match: ImageSearchMatch;
  similars: SimilarProduct[];
}

export interface PineconeMatch {
  id: string;
  score: number;
  metadata: {
    productId: string;
    title?: string;
    image?: string;
    price?: number;
    brand?: string;
    category?: string;
    [key: string]: any;
  };
}
