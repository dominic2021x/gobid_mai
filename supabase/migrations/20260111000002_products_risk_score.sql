-- ===============================================================
-- Supabase Migration: Products Risk Score
-- ===============================================================
-- Adaugă coloane pentru scorul de risc AI la tabelul products

-- Adaugă coloana risk_score dacă nu există
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'risk_score'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN risk_score NUMERIC DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100);
  END IF;
END $$;

-- Adaugă coloana risk_analysis_data dacă nu există (pentru a stoca datele complete ale analizei)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'risk_analysis_data'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN risk_analysis_data JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Adaugă index pentru risk_score (pentru căutări eficiente)
CREATE INDEX IF NOT EXISTS idx_products_risk_score ON public.products(risk_score DESC);

-- Comentarii
COMMENT ON COLUMN public.products.risk_score IS 'Scor de risc AI (0-100). 0 = foarte sigur, 100 = foarte riscant';
COMMENT ON COLUMN public.products.risk_analysis_data IS 'Date complete ale analizei de risc AI (factorii, recomandarea, detalii, etc.)';
