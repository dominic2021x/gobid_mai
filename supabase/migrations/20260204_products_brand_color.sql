-- ============================================
-- Migration: Add brand, color to products
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand'
  ) THEN
    ALTER TABLE public.products ADD COLUMN brand TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'color'
  ) THEN
    ALTER TABLE public.products ADD COLUMN color TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'condition'
  ) THEN
    ALTER TABLE public.products ADD COLUMN condition TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products (brand);
CREATE INDEX IF NOT EXISTS idx_products_color ON public.products (color);
CREATE INDEX IF NOT EXISTS idx_products_condition ON public.products (condition);

COMMENT ON COLUMN public.products.brand IS 'Marca produsului (Samsung, Dacia, etc.)';
COMMENT ON COLUMN public.products.color IS 'Culoarea produsului';
COMMENT ON COLUMN public.products.condition IS 'Starea produsului (Nou, Foarte bună, etc.)';
