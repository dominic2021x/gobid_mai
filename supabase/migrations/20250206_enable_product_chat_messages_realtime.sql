-- ============================================
-- Migration: Enable Realtime for product_chat_messages
-- ============================================
-- Activează Realtime pentru product_chat_messages pentru actualizări live ale mesajelor

-- Verifică dacă tabelul există și dacă nu este deja publicat
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chat_messages'
  ) THEN
    -- Verifică dacă tabelul nu este deja publicat
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'product_chat_messages'
    ) THEN
      -- Adaugă tabelul la publication
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_chat_messages;
      RAISE NOTICE 'Tabelul product_chat_messages a fost adăugat la supabase_realtime publication';
    ELSE
      RAISE NOTICE 'Tabelul product_chat_messages este deja publicat în supabase_realtime';
    END IF;
  ELSE
    RAISE WARNING 'Tabelul product_chat_messages nu există. Asigură-te că migrarea pentru product_chat_messages a fost aplicată mai întâi.';
  END IF;
END $$;



