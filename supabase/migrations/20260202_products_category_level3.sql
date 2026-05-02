-- ============================================
-- Migration: Add category_level_3 to products
-- ============================================
-- Level 1: category, Level 2: subcategory, Level 3: sub_subcategory (ex: piese-auto → aripa, capota, far)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_level_3'
  ) THEN
    ALTER TABLE public.products ADD COLUMN category_level_3 TEXT;
  END IF;
END $$;

-- Index pentru filtrare rapidă pe toate 3 nivelurile
CREATE INDEX IF NOT EXISTS idx_products_category_level3 
ON public.products (category, subcategory, category_level_3);

COMMENT ON COLUMN public.products.category_level_3 IS 'Nivel 3 al categoriei (ex: piese-auto → aripa, capota, far)';
