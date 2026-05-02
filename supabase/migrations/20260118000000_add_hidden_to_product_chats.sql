-- ============================================
-- Migration: Add hidden_by_user_ids to product_chats
-- ============================================
-- Permite utilizatorilor să ascundă conversațiile (soft delete)
-- Admin-ii pot vedea toate conversațiile, inclusiv cele ascunse

-- Adaugă coloană hidden_by_user_ids în product_chats dacă nu există
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_chats' 
    AND column_name = 'hidden_by_user_ids'
  ) THEN
    ALTER TABLE public.product_chats 
    ADD COLUMN hidden_by_user_ids UUID[] DEFAULT ARRAY[]::UUID[];
    
    CREATE INDEX IF NOT EXISTS idx_product_chats_hidden_by_user_ids 
    ON public.product_chats USING gin (hidden_by_user_ids);
  END IF;
END $$;

-- Actualizează RLS policies pentru a permite admin-ii să vadă toate conversațiile
DROP POLICY IF EXISTS "Users can view their product chats" ON public.product_chats;
CREATE POLICY "Users can view their product chats"
  ON public.product_chats
  FOR SELECT
  USING (
    -- Admin-ii pot vedea toate conversațiile
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Utilizatorii obișnuiți pot vedea doar conversațiile în care sunt implicați și nu sunt ascunse de ei
    (
      (auth.uid() = buyer_user_id OR auth.uid() = seller_user_id)
      AND (
        hidden_by_user_ids IS NULL 
        OR NOT (auth.uid() = ANY(hidden_by_user_ids))
      )
    )
  );

-- Policy pentru UPDATE - permite utilizatorilor să marcheze conversațiile ca hidden
DROP POLICY IF EXISTS "Users can update their product chats" ON public.product_chats;
CREATE POLICY "Users can update their product chats"
  ON public.product_chats
  FOR UPDATE
  USING (
    auth.uid() = buyer_user_id OR 
    auth.uid() = seller_user_id
    OR
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );
