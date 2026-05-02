-- ============================================
-- Migration: Add metadata column to product_chats
-- ============================================
-- Adaugă coloana metadata pentru a stoca informații suplimentare
-- (cum ar fi blocked_by_seller, blocked_by_buyer, etc.)

-- Adaugă coloana metadata dacă nu există
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chats' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.product_chats 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    
    -- Adaugă un index pentru căutări eficiente în metadata
    CREATE INDEX IF NOT EXISTS idx_product_chats_metadata 
    ON public.product_chats USING gin (metadata);
  END IF;
END $$;
