-- ============================================
-- Migration: Enable Realtime for bids table
-- ============================================
-- Activează Realtime pentru tabelul bids pentru a permite actualizări în timp real
-- ale numărului de oferte pentru produse

-- Verifică dacă tabelul bids există
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
    -- Verifică dacă tabelul nu este deja în publicația Realtime
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'bids'
    ) THEN
      -- Adaugă tabelul bids la publicația Realtime
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
      RAISE NOTICE 'Realtime enabled for bids table';
    ELSE
      RAISE NOTICE 'bids table is already in supabase_realtime publication';
    END IF;
  ELSE
    RAISE NOTICE 'bids table does not exist, skipping Realtime setup';
  END IF;
END $$;



