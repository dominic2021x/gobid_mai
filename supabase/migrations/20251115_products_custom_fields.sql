-- ============================================
-- Migration: Products Custom Fields
-- ============================================
-- Asigură că tabelul products are câmpul custom_fields
-- pentru a stoca câmpurile dinamice specifice fiecărei categorii

-- Verifică dacă tabelul products există, dacă nu, îl creează
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE,
  sku TEXT UNIQUE,
  category TEXT,
  subcategory TEXT,
  starting_price NUMERIC DEFAULT 0,
  starting_price_ron NUMERIC,
  starting_price_eur NUMERIC,
  currency TEXT DEFAULT 'RON',
  product_type TEXT,
  sale_type TEXT,
  status TEXT DEFAULT 'draft',
  county TEXT,
  city TEXT,
  address TEXT,
  product_location TEXT,
  auction_date TIMESTAMPTZ,
  auction_registration_date DATE,
  auction_location TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  seo JSONB DEFAULT '{}'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adaugă câmpul custom_fields dacă nu există (pentru tabele existente)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'custom_fields'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Creează index pentru custom_fields dacă nu există (pentru căutări eficiente)
CREATE INDEX IF NOT EXISTS idx_products_custom_fields 
ON public.products USING GIN (custom_fields);

-- Creează index pentru categoria și subcategoria (pentru filtrare rapidă)
CREATE INDEX IF NOT EXISTS idx_products_category 
ON public.products (category, subcategory);

-- Creează index pentru status (pentru filtrare rapidă)
CREATE INDEX IF NOT EXISTS idx_products_status 
ON public.products (status);

-- Creează index pentru auction_date (pentru sortare și filtrare)
CREATE INDEX IF NOT EXISTS idx_products_auction_date 
ON public.products (auction_date);

-- Funcție pentru a actualiza updated_at automat
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pentru a actualiza updated_at automat
DROP TRIGGER IF EXISTS update_products_updated_at_trigger ON public.products;
CREATE TRIGGER update_products_updated_at_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- Comentarii pentru documentație
COMMENT ON COLUMN public.products.custom_fields IS 'Câmpuri dinamice specifice fiecărei categorii. Pentru Autoturisme: marca, model, culoare, caroserie, an, kilometraj, combustibil, transmisie, putere, serie_sasiu, clasa_emisii, stare, etc.';
COMMENT ON COLUMN public.products.auction_date IS 'Data și ora licitației în format TIMESTAMPTZ (YYYY-MM-DDTHH:MM:SS)';
COMMENT ON COLUMN public.products.auction_registration_date IS 'Data înscrierii licitației în format DATE (YYYY-MM-DD)';

-- ============================================
-- Row Level Security (RLS) pentru products
-- ============================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Helper function pentru verificarea dacă utilizatorul este admin
-- (folosim CREATE OR REPLACE pentru a evita erori dacă funcția există deja)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'role') = 'admin' OR
    (auth.jwt() ->> 'is_admin')::boolean = true OR
    EXISTS (
      SELECT 1 FROM public.admin_page_permissions 
      WHERE user_id = auth.uid() 
      AND has_access = true
    ),
    false
  );
$$;

-- Policy: Oricine poate citi produsele active
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'products' 
      AND policyname = 'Anyone can view active products'
  ) THEN
    CREATE POLICY "Anyone can view active products" ON public.products
      FOR SELECT
      USING (status = 'active');
  END IF;
END $$;

-- Policy: Adminii pot vedea toate produsele
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'products' 
      AND policyname = 'Admins can view all products'
  ) THEN
    CREATE POLICY "Admins can view all products" ON public.products
      FOR SELECT
      USING (public.is_admin());
  END IF;
END $$;

-- Policy: Adminii pot crea produse
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'products' 
      AND policyname = 'Admins can insert products'
  ) THEN
    CREATE POLICY "Admins can insert products" ON public.products
      FOR INSERT
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Policy: Adminii pot actualiza produse
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'products' 
      AND policyname = 'Admins can update products'
  ) THEN
    CREATE POLICY "Admins can update products" ON public.products
      FOR UPDATE
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Policy: Adminii pot șterge produse
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'products' 
      AND policyname = 'Admins can delete products'
  ) THEN
    CREATE POLICY "Admins can delete products" ON public.products
      FOR DELETE
      USING (public.is_admin());
  END IF;
END $$;

