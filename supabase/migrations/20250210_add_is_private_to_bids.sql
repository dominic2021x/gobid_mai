-- ============================================
-- Migration: Add is_private column to bids table
-- ============================================
-- Adaugă câmpul is_private pentru a permite ofertele private
-- Ofertele private sunt vizibile doar pentru ofertant și vânzător

-- Verifică dacă tabelul bids există
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'bids'
  ) THEN
    -- Adaugă coloana is_private dacă nu există
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'bids'
      AND column_name = 'is_private'
    ) THEN
      ALTER TABLE public.bids
      ADD COLUMN is_private BOOLEAN DEFAULT false NOT NULL;
      
      RAISE NOTICE 'Coloana is_private a fost adăugată la tabelul bids.';
    ELSE
      RAISE NOTICE 'Coloana is_private există deja în tabelul bids.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabelul bids nu există.';
  END IF;
END $$;

-- Creează index pentru is_private dacă nu există (pentru căutări eficiente)
CREATE INDEX IF NOT EXISTS idx_bids_is_private 
ON public.bids(is_private) 
WHERE is_private = true;


