-- ============================================
-- Migration: Add category_level_4 to products (imobiliare – terenuri: intravilan / extravilan)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_level_4'
  ) THEN
    ALTER TABLE public.products ADD COLUMN category_level_4 TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.products.category_level_4 IS 'Nivel 4: doar pentru terenuri / exec-imobiliare – intravilan sau extravilan';
