-- Script pentru adăugarea coloanelor premium în tabelul products
-- Rulează acest script în Supabase SQL Editor

-- Adaugă coloanele premium_until și is_premium în tabelul products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Verifică dacă coloanele au fost adăugate
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'products'
  AND column_name IN ('premium_until', 'is_premium');

-- Creează index pentru premium products (pentru căutări rapide)
CREATE INDEX IF NOT EXISTS idx_products_premium 
  ON public.products (is_premium, premium_until) 
  WHERE is_premium = true;

-- Creează index pentru active premium products (pentru homepage sorting)
-- Notă: Verificarea premium_until > NOW() se face la runtime, nu în index
CREATE INDEX IF NOT EXISTS idx_products_premium_active 
  ON public.products (is_premium, premium_until, created_at DESC) 
  WHERE is_premium = true AND status = 'active';

-- Comentarii pentru documentație
COMMENT ON COLUMN public.products.premium_until IS 'Data până la care promovarea premium este activă';
COMMENT ON COLUMN public.products.is_premium IS 'Indică dacă produsul are promovare premium activă';

-- Mesaj de confirmare
DO $$
BEGIN
  RAISE NOTICE 'Coloanele premium au fost adăugate cu succes în tabelul products!';
END $$;













-- Script pentru adăugarea coloanelor premium în tabelul products
-- Rulează acest script în Supabase SQL Editor

-- Adaugă coloanele premium_until și is_premium în tabelul products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Verifică dacă coloanele au fost adăugate
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'products'
  AND column_name IN ('premium_until', 'is_premium');

-- Creează index pentru premium products (pentru căutări rapide)
CREATE INDEX IF NOT EXISTS idx_products_premium 
  ON public.products (is_premium, premium_until) 
  WHERE is_premium = true;

-- Creează index pentru active premium products (pentru homepage sorting)
-- Notă: Verificarea premium_until > NOW() se face la runtime, nu în index
CREATE INDEX IF NOT EXISTS idx_products_premium_active 
  ON public.products (is_premium, premium_until, created_at DESC) 
  WHERE is_premium = true AND status = 'active';

-- Comentarii pentru documentație
COMMENT ON COLUMN public.products.premium_until IS 'Data până la care promovarea premium este activă';
COMMENT ON COLUMN public.products.is_premium IS 'Indică dacă produsul are promovare premium activă';

-- Mesaj de confirmare
DO $$
BEGIN
  RAISE NOTICE 'Coloanele premium au fost adăugate cu succes în tabelul products!';
END $$;













-- Script pentru adăugarea coloanelor premium în tabelul products
-- Rulează acest script în Supabase SQL Editor

-- Adaugă coloanele premium_until și is_premium în tabelul products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Verifică dacă coloanele au fost adăugate
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'products'
  AND column_name IN ('premium_until', 'is_premium');

-- Creează index pentru premium products (pentru căutări rapide)
CREATE INDEX IF NOT EXISTS idx_products_premium 
  ON public.products (is_premium, premium_until) 
  WHERE is_premium = true;

-- Creează index pentru active premium products (pentru homepage sorting)
-- Notă: Verificarea premium_until > NOW() se face la runtime, nu în index
CREATE INDEX IF NOT EXISTS idx_products_premium_active 
  ON public.products (is_premium, premium_until, created_at DESC) 
  WHERE is_premium = true AND status = 'active';

-- Comentarii pentru documentație
COMMENT ON COLUMN public.products.premium_until IS 'Data până la care promovarea premium este activă';
COMMENT ON COLUMN public.products.is_premium IS 'Indică dacă produsul are promovare premium activă';

-- Mesaj de confirmare
DO $$
BEGIN
  RAISE NOTICE 'Coloanele premium au fost adăugate cu succes în tabelul products!';
END $$;

























