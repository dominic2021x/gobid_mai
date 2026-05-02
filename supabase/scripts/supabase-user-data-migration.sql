-- ============================================
-- User Data Migration - Supabase Tables
-- ============================================
-- Rulează acest script în Supabase SQL Editor
-- pentru a crea toate tabelele necesare pentru datele utilizatorilor

-- ============================================
-- Tabel: user_favorites
-- ============================================
DROP TABLE IF EXISTS user_favorites CASCADE;

CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('auction', 'product')),
  favorite_list_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, item_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_email ON user_favorites(user_email);
CREATE INDEX IF NOT EXISTS idx_user_favorites_item_id ON user_favorites(item_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_list_id ON user_favorites(favorite_list_id);

-- ============================================
-- Tabel: user_favorite_lists
-- ============================================
DROP TABLE IF EXISTS user_favorite_lists CASCADE;

CREATE TABLE user_favorite_lists (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_lists_user_id ON user_favorite_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_lists_user_email ON user_favorite_lists(user_email);

-- ============================================
-- Tabel: user_unlocked_auctions
-- ============================================
DROP TABLE IF EXISTS user_unlocked_auctions CASCADE;

CREATE TABLE user_unlocked_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  auction_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, auction_id)
);

CREATE INDEX IF NOT EXISTS idx_user_unlocked_auctions_user_id ON user_unlocked_auctions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_unlocked_auctions_user_email ON user_unlocked_auctions(user_email);
CREATE INDEX IF NOT EXISTS idx_user_unlocked_auctions_auction_id ON user_unlocked_auctions(auction_id);

-- ============================================
-- Tabel: user_auction_notifications
-- ============================================
DROP TABLE IF EXISTS user_auction_notifications CASCADE;

CREATE TABLE user_auction_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  auction_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  time_before TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, auction_id)
);

CREATE INDEX IF NOT EXISTS idx_user_auction_notifications_user_id ON user_auction_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_auction_notifications_user_email ON user_auction_notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_user_auction_notifications_auction_id ON user_auction_notifications(auction_id);

-- ============================================
-- Tabel: user_activity_logs
-- ============================================
DROP TABLE IF EXISTS user_activity_logs CASCADE;

CREATE TABLE user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  event TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_email ON user_activity_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_event ON user_activity_logs(event);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- ============================================
-- Tabel: user_auction_history
-- ============================================
DROP TABLE IF EXISTS user_auction_history CASCADE;

CREATE TABLE user_auction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  auction_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_auction_history_user_id ON user_auction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_auction_history_user_email ON user_auction_history(user_email);
CREATE INDEX IF NOT EXISTS idx_user_auction_history_auction_id ON user_auction_history(auction_id);
CREATE INDEX IF NOT EXISTS idx_user_auction_history_created_at ON user_auction_history(created_at DESC);

-- ============================================
-- Tabel: user_watchlist
-- ============================================
DROP TABLE IF EXISTS user_watchlist CASCADE;

CREATE TABLE user_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_email ON user_watchlist(user_email);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_product_id ON user_watchlist(product_id);

-- ============================================
-- Funcție: update_updated_at_column
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger: user_favorite_lists_updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_user_favorite_lists_updated_at ON user_favorite_lists;
CREATE TRIGGER update_user_favorite_lists_updated_at
  BEFORE UPDATE ON user_favorite_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Trigger: user_auction_notifications_updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_user_auction_notifications_updated_at ON user_auction_notifications;
CREATE TRIGGER update_user_auction_notifications_updated_at
  BEFORE UPDATE ON user_auction_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies: user_favorites
-- ============================================
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own favorites" ON user_favorites;
CREATE POLICY "Users can view own favorites"
  ON user_favorites FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own favorites" ON user_favorites;
CREATE POLICY "Users can insert own favorites"
  ON user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own favorites" ON user_favorites;
CREATE POLICY "Users can update own favorites"
  ON user_favorites FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON user_favorites;
CREATE POLICY "Users can delete own favorites"
  ON user_favorites FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all favorites" ON user_favorites;
CREATE POLICY "Admins can view all favorites"
  ON user_favorites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_favorite_lists
-- ============================================
ALTER TABLE user_favorite_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own favorite lists" ON user_favorite_lists;
CREATE POLICY "Users can view own favorite lists"
  ON user_favorite_lists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own favorite lists" ON user_favorite_lists;
CREATE POLICY "Users can insert own favorite lists"
  ON user_favorite_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own favorite lists" ON user_favorite_lists;
CREATE POLICY "Users can update own favorite lists"
  ON user_favorite_lists FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own favorite lists" ON user_favorite_lists;
CREATE POLICY "Users can delete own favorite lists"
  ON user_favorite_lists FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all favorite lists" ON user_favorite_lists;
CREATE POLICY "Admins can view all favorite lists"
  ON user_favorite_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_unlocked_auctions
-- ============================================
ALTER TABLE user_unlocked_auctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own unlocked auctions" ON user_unlocked_auctions;
CREATE POLICY "Users can view own unlocked auctions"
  ON user_unlocked_auctions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own unlocked auctions" ON user_unlocked_auctions;
CREATE POLICY "Users can insert own unlocked auctions"
  ON user_unlocked_auctions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own unlocked auctions" ON user_unlocked_auctions;
CREATE POLICY "Users can delete own unlocked auctions"
  ON user_unlocked_auctions FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all unlocked auctions" ON user_unlocked_auctions;
CREATE POLICY "Admins can view all unlocked auctions"
  ON user_unlocked_auctions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_auction_notifications
-- ============================================
ALTER TABLE user_auction_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auction notifications" ON user_auction_notifications;
CREATE POLICY "Users can view own auction notifications"
  ON user_auction_notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own auction notifications" ON user_auction_notifications;
CREATE POLICY "Users can insert own auction notifications"
  ON user_auction_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own auction notifications" ON user_auction_notifications;
CREATE POLICY "Users can update own auction notifications"
  ON user_auction_notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own auction notifications" ON user_auction_notifications;
CREATE POLICY "Users can delete own auction notifications"
  ON user_auction_notifications FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all auction notifications" ON user_auction_notifications;
CREATE POLICY "Admins can view all auction notifications"
  ON user_auction_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_activity_logs
-- ============================================
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activity logs" ON user_activity_logs;
CREATE POLICY "Users can view own activity logs"
  ON user_activity_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own activity logs" ON user_activity_logs;
CREATE POLICY "Users can insert own activity logs"
  ON user_activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all activity logs" ON user_activity_logs;
CREATE POLICY "Admins can view all activity logs"
  ON user_activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_auction_history
-- ============================================
ALTER TABLE user_auction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auction history" ON user_auction_history;
CREATE POLICY "Users can view own auction history"
  ON user_auction_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own auction history" ON user_auction_history;
CREATE POLICY "Users can insert own auction history"
  ON user_auction_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all auction history" ON user_auction_history;
CREATE POLICY "Admins can view all auction history"
  ON user_auction_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies: user_watchlist
-- ============================================
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own watchlist" ON user_watchlist;
CREATE POLICY "Users can view own watchlist"
  ON user_watchlist FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own watchlist" ON user_watchlist;
CREATE POLICY "Users can insert own watchlist"
  ON user_watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own watchlist" ON user_watchlist;
CREATE POLICY "Users can delete own watchlist"
  ON user_watchlist FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all watchlist" ON user_watchlist;
CREATE POLICY "Admins can view all watchlist"
  ON user_watchlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );





