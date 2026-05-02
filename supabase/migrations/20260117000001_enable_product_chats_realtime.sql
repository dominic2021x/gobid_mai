-- ============================================
-- Migration: Enable Realtime for product_chats
-- ============================================
-- Activează Realtime pentru product_chats pentru actualizări live ale metadata (blocare/deblocare chat)

-- Verifică dacă tabelul există și dacă nu este deja publicat
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chats'
  ) THEN
    -- Verifică dacă tabelul nu este deja publicat
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'product_chats'
    ) THEN
      -- Adaugă tabelul la publication
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_chats;
      RAISE NOTICE 'Tabelul product_chats a fost adăugat la supabase_realtime publication';
    ELSE
      RAISE NOTICE 'Tabelul product_chats este deja publicat în supabase_realtime';
    END IF;
  ELSE
    RAISE WARNING 'Tabelul product_chats nu există. Asigură-te că migrarea pentru product_chats a fost aplicată mai întâi.';
  END IF;
END $$;
