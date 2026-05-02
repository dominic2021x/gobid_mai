export type PriceLevel = "very_good" | "good" | "fair" | "high" | "very_high";

export type ProductCategory = 'auto' | 'apartment' | 'house' | 'land' | 'electronics' | 'fashion' | 'other';

export interface PriceRanges {
  very_good: [number, number];
  good: [number, number];
  fair: [number, number];
  high: [number, number];
  very_high: [number, number];
}

export interface ProductForEvaluation {
  id?: string;
  title: string;
  description?: string;
  category: string;
  price: number;
  currency: string;
  city?: string;
  area?: string;
  country?: string;
  attributes?: Record<string, any>;
  /** Tip produs: licitatii-publice = licitație publică (prețurile sunt 30-60% sub piață) */
  product_type?: string;
}

export interface AIExplanation {
  summary: string;
  details: {
    ro_short: string;
    ro_long: string;
    bullets: string[];
  };
}

export interface PriceEvaluationResponse {
  ok: boolean;
  noEvaluation?: boolean;
  error?: string;
  product: ProductForEvaluation;
  samplesCount: number;
  samples: number[];
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  ranges: PriceRanges;
  level: PriceLevel;
  aiExplanation: AIExplanation;
  /** Moneda pentru afișare (când e diferită de product.currency, ex. EUR pentru evaluări > 1000 EUR) */
  displayCurrency?: string;
  /** Prețul produsului în displayCurrency (când product.currency e Lei dar afișăm EUR) */
  priceDisplay?: number;
}

