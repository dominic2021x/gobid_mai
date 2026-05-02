-- ============================================
-- Migration: Enable Realtime for user_payments table
-- ============================================
-- Activează Realtime pentru tabelul user_payments pentru a permite actualizări în timp real
-- ale creditelor utilizatorilor când admin-ul adaugă credite

-- Verifică dacă tabelul user_payments există
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_payments') THEN
    -- Verifică dacă tabelul nu este deja în publicația Realtime
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_payments'
    ) THEN
      -- Adaugă tabelul user_payments la publicația Realtime
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_payments;
      RAISE NOTICE 'Realtime enabled for user_payments table';
    ELSE
      RAISE NOTICE 'user_payments table is already in supabase_realtime publication';
    END IF;
  ELSE
    RAISE NOTICE 'user_payments table does not exist, skipping Realtime setup';
  END IF;
END $$;
