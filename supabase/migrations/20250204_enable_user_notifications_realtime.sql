-- ============================================
-- Migration: Enable Realtime for user_notifications
-- ============================================
-- Activează Realtime pentru user_notifications pentru notificări live

-- Verifică dacă tabelul există și dacă nu este deja publicat
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_notifications'
  ) THEN
    -- Verifică dacă tabelul nu este deja publicat
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_notifications'
    ) THEN
      -- Adaugă tabelul la publication
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
      RAISE NOTICE 'Tabelul user_notifications a fost adăugat la supabase_realtime publication';
    ELSE
      RAISE NOTICE 'Tabelul user_notifications este deja publicat în supabase_realtime';
    END IF;
  ELSE
    RAISE WARNING 'Tabelul user_notifications nu există. Asigură-te că migrarea pentru user_notifications a fost aplicată mai întâi.';
  END IF;
END $$;

