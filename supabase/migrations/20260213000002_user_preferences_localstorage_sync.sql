-- ===============================================================
-- Migrare: Sincronizare date din localStorage în baza de date
-- ===============================================================
-- Tabelele user_settings, user_favorites, user_unlocked_products
-- și user_custom_buttons există deja. Acest script:
-- 1) Asigură că user_settings poate stoca toate cheile din localStorage
-- 2) Adaugă tabelă user_recently_viewed pentru istoric vizualizări (opțional)
-- 3) Documentează categoriile folosite în user_settings
-- ===============================================================

-- user_settings există deja (user_id, category, data jsonb).
-- Categorii folosite pentru date din localStorage:
--   'preferences'     -> { "darkMode": true, "showHeaderNameDesktop": "1", ... }
--   'saved_filters'   -> { filters object }
--   'search_history'  -> [ "query1", "query2", ... ]
--   'recently_viewed' -> [ "productId1", "productId2", ... ]  (ultimele N)
--   'auction_notifications' -> { ... }

-- Tabel opțional: istoric vizualizări (pentru limit și ordine)
CREATE TABLE IF NOT EXISTS public.user_recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_recently_viewed_user_viewed
  ON public.user_recently_viewed (user_id, viewed_at DESC);

ALTER TABLE public.user_recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recently viewed" ON public.user_recently_viewed;
CREATE POLICY "Users manage own recently viewed"
  ON public.user_recently_viewed
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comentarii pentru documentare
COMMENT ON TABLE public.user_settings IS 'Setări utilizator pe categorii; folosit pentru sync din localStorage: preferences, saved_filters, search_history, recently_viewed, auction_notifications';
COMMENT ON TABLE public.user_recently_viewed IS 'Ultimele produse vizualizate de utilizator (sync din localStorage recentlyViewedProducts)';
