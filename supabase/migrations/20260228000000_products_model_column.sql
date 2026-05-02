-- ============================================
-- Migration: Add model column to public.products (brand already exists from 20260204)
-- Safe, additive. Run via Supabase migrations or SQL Editor.
-- ============================================

-- 1. Add model column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model TEXT;

COMMENT ON COLUMN public.products.model IS 'Model produs (ex: iPhone 14, Logan, A4) – first-class pentru filtre și căutare pe /ro';

-- 2. Ensure brand exists (idempotent; 20260204 may have already added it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand'
  ) THEN
    ALTER TABLE public.products ADD COLUMN brand TEXT;
    COMMENT ON COLUMN public.products.brand IS 'Marca produsului (Samsung, Dacia, etc.)';
  END IF;
END $$;

-- 3. B-tree indexes for filtering (equality / prefix)
CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (brand);
CREATE INDEX IF NOT EXISTS products_model_idx ON public.products (model);

-- 4. Trigram indexes for ILIKE / contains (requires pg_trgm; phase1 already adds it)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_brand_trgm_idx ON public.products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_model_trgm_idx ON public.products USING gin (model gin_trgm_ops);
