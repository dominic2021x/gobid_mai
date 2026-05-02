-- ============================================
-- Migration: Allow user favorites
-- ============================================
-- Permite salvarea utilizatorilor în favorite
-- Modifică constraint-ul pentru item_type să includă 'user'

-- Verifică dacă tabelul user_favorites există și are constraint-ul
DO $$
DECLARE
  constraint_exists boolean;
  table_exists boolean;
BEGIN
  -- Verifică dacă tabelul există
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_favorites'
  ) INTO table_exists;

  IF table_exists THEN
    -- Verifică dacă există constraint-ul
    SELECT EXISTS (
      SELECT 1 
      FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public'
      AND constraint_name LIKE '%item_type%check%'
      AND table_name = 'user_favorites'
    ) INTO constraint_exists;

    -- Șterge toate constraint-urile vechi pentru item_type
    IF constraint_exists THEN
      -- Găsește și șterge toate constraint-urile care conțin item_type
      EXECUTE (
        SELECT string_agg('ALTER TABLE public.user_favorites DROP CONSTRAINT IF EXISTS ' || constraint_name || ';', ' ')
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
        AND constraint_name LIKE '%item_type%check%'
        AND table_name = 'user_favorites'
      );
    END IF;

    -- Verifică dacă coloana item_type există
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'user_favorites'
      AND column_name = 'item_type'
    ) THEN
      -- Adaugă noul constraint care permite 'user'
      ALTER TABLE public.user_favorites 
      ADD CONSTRAINT user_favorites_item_type_check 
      CHECK (item_type IN ('auction', 'product', 'user'));
    END IF;
  END IF;
END $$;

