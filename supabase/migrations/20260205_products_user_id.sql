-- ============================================
-- Migration: Add user_id to products (if missing)
-- ============================================
-- RLS policies (20260118_fix_user_access_policies) use user_id = auth.uid();
-- CREATE TABLE in 20251115 did not include user_id. This adds it for existing DBs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products (user_id);
    COMMENT ON COLUMN public.products.user_id IS 'Proprietarul produsului (pentru RLS și filtrare)';
  END IF;
END $$;
