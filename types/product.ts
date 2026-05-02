/**
 * Tipuri partajate pentru produse și categorii folosite în modulele AI.
 */

export interface ProductRecord {
  id: string;
  title: string | null;
  description: string | null;
  brand: string | null;
  price_ron?: number | null;
  price_eur?: number | null;
  category: string | null;
  subcategory: string | null;
  attributes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProductMetadata {
  type: 'product' | 'category';
  title: string;
  description: string;
  brand?: string | null;
  price?: number | null;
  currency?: 'RON' | 'EUR' | string | null;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
  supabase_id: string;
}

export interface CategoryDocument {
  id: string;
  name: string;
  description: string;
  sourceProductIds: string[];
}










