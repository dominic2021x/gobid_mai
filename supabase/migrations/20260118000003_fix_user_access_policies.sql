-- ============================================
-- Migration: Fix User Access Policies
-- ============================================
-- Asigură că toți utilizatorii pot accesa propriile date și că profilurile sunt vizibile public

-- 1. Fix user_profiles - Asigură că există ambele politici (public view + own management)
DO $$
BEGIN
  -- Enable RLS
  ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

  -- Policy pentru citire publică (oricine poate vedea profilurile)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_profiles' 
    AND policyname = 'Public can view user profiles'
  ) THEN
    CREATE POLICY "Public can view user profiles"
      ON public.user_profiles
      FOR SELECT
      USING (true);
  END IF;

  -- Policy pentru gestionarea propriului profil (UPDATE/INSERT/DELETE)
  DROP POLICY IF EXISTS "Users manage own profile" ON public.user_profiles;
  CREATE POLICY "Users manage own profile"
    ON public.user_profiles
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;

-- 2. Fix products - Asigură că utilizatorii pot vedea produsele lor (chiar dacă nu sunt active)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'products' 
    AND policyname = 'Users can view their own products'
  ) THEN
    CREATE POLICY "Users can view their own products" ON public.products
      FOR SELECT
      USING (
        auth.uid() IS NOT NULL 
        AND user_id = auth.uid()
      );
  END IF;

  -- Asigură că utilizatorii pot actualiza produsele lor
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'products' 
    AND policyname = 'Users can update their own products'
  ) THEN
    CREATE POLICY "Users can update their own products" ON public.products
      FOR UPDATE
      USING (
        auth.uid() IS NOT NULL 
        AND user_id = auth.uid()
      )
      WITH CHECK (
        auth.uid() IS NOT NULL 
        AND user_id = auth.uid()
      );
  END IF;

  -- Asigură că utilizatorii pot crea produse
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'products' 
    AND policyname = 'Authenticated users can insert products'
  ) THEN
    CREATE POLICY "Authenticated users can insert products" ON public.products
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL 
        AND user_id = auth.uid()
      );
  END IF;
END $$;

-- 3. Fix user_tokens - Asigură că utilizatorii pot accesa propriile token-uri
DO $$
BEGIN
  ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users manage own tokens" ON public.user_tokens;
  CREATE POLICY "Users manage own tokens"
    ON public.user_tokens
    FOR ALL
    USING (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    )
    WITH CHECK (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    );
END $$;

-- 4. Fix user_settings - Asigură că utilizatorii pot accesa propriile setări
DO $$
BEGIN
  ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
  CREATE POLICY "Users manage own settings"
    ON public.user_settings
    FOR ALL
    USING (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    )
    WITH CHECK (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    );
END $$;

-- 5. Fix user_notifications - Asigură că utilizatorii pot accesa propriile notificări
DO $$
BEGIN
  ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
  CREATE POLICY "Users read own notifications"
    ON public.user_notifications
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    );

  DROP POLICY IF EXISTS "Users update read status" ON public.user_notifications;
  CREATE POLICY "Users update read status"
    ON public.user_notifications
    FOR UPDATE
    USING (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    )
    WITH CHECK (
      auth.uid() IS NOT NULL 
      AND auth.uid() = user_id
    );
END $$;

-- Note: Această migrație asigură că toți utilizatorii autentificați pot accesa propriile date
-- și că profilurile sunt vizibile public pentru funcționalități precum chat-uri și conversații.
