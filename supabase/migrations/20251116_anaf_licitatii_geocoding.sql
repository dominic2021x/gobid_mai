-- ============================================
-- Migration: Add Geocoding and Street View columns to anaf_licitatii
-- ============================================
-- Data: 2025-11-16
-- Descriere: Adaugă coloane pentru coordonate GPS și URL Street View

-- Adaugă coloana lat (latitudine)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'anaf_licitatii' 
      AND column_name = 'lat'
  ) THEN
    ALTER TABLE public.anaf_licitatii 
    ADD COLUMN lat DOUBLE PRECISION;
    
    COMMENT ON COLUMN public.anaf_licitatii.lat IS 'Latitudine GPS obținută prin geocodare';
  END IF;
END $$;

-- Adaugă coloana lng (longitudine)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'anaf_licitatii' 
      AND column_name = 'lng'
  ) THEN
    ALTER TABLE public.anaf_licitatii 
    ADD COLUMN lng DOUBLE PRECISION;
    
    COMMENT ON COLUMN public.anaf_licitatii.lng IS 'Longitudine GPS obținută prin geocodare';
  END IF;
END $$;

-- Adaugă coloana streetViewImageUrl
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'anaf_licitatii' 
      AND column_name = 'street_view_image_url'
  ) THEN
    ALTER TABLE public.anaf_licitatii 
    ADD COLUMN street_view_image_url TEXT;
    
    COMMENT ON COLUMN public.anaf_licitatii.street_view_image_url IS 'URL-ul imaginii Google Street View pentru această locație';
  END IF;
END $$;

-- Creează index pentru coordonate (pentru căutări geografice)
CREATE INDEX IF NOT EXISTS idx_anaf_licitatii_coordinates 
ON public.anaf_licitatii(lat, lng) 
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Verificare
DO $$ 
BEGIN
  RAISE NOTICE 'Migration completed. Columns added: lat, lng, street_view_image_url';
END $$;



