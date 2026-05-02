-- ============================================
-- Migration: Enable Realtime for user_favorites
-- ============================================
-- Activează Realtime pentru tabela user_favorites pentru sincronizare în timp real

-- Verifică dacă tabelul există
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_favorites'
  ) THEN
    -- Verifică dacă tabelul este deja în publicația Realtime
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_favorites'
    ) THEN
      -- Adaugă tabelul la publicația Realtime
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_favorites;
      RAISE NOTICE 'Tabelul user_favorites a fost adăugat la publicația Realtime.';
    ELSE
      RAISE NOTICE 'Tabelul user_favorites este deja în publicația Realtime.';
    END IF;
  ELSE
    RAISE NOTICE 'Tabelul user_favorites nu există.';
  END IF;
END $$;



