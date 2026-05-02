-- ============================================
-- Allow users to DELETE only their own draft products (for AI assistant deleteDraft tool)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Users can delete own draft products'
  ) THEN
    CREATE POLICY "Users can delete own draft products" ON public.products
      FOR DELETE
      USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND status = 'draft'
      );
  END IF;
END $$;

COMMENT ON POLICY "Users can delete own draft products" ON public.products IS 'Asistent AI: utilizatorul poate șterge doar propriile drafturi.';
