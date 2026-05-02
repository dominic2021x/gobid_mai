-- ============================================
-- Migration: Add size to products (XS, S, M, L, XL etc.)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size'
  ) THEN
    ALTER TABLE public.products ADD COLUMN size TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_size ON public.products (size);

COMMENT ON COLUMN public.products.size IS 'Mărime produs (XS, S, M, L, XL, 38, 40 etc.)';
