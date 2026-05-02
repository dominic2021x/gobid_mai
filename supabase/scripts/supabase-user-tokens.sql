-- ============================================
-- User Tokens - Supabase Tables
-- ============================================
-- Rulează acest script în Supabase SQL Editor
-- pentru a crea tabelele necesare pentru tokens

-- ============================================
-- Tabel: user_tokens
-- ============================================
-- Șterge tabelul dacă există pentru a-l recrea cu structura corectă
DROP TABLE IF EXISTS token_transactions CASCADE;
DROP TABLE IF EXISTS user_tokens CASCADE;

CREATE TABLE user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  balance INTEGER DEFAULT 10 NOT NULL,
  total_earned INTEGER DEFAULT 10 NOT NULL,
  total_spent INTEGER DEFAULT 0 NOT NULL,
  level TEXT DEFAULT 'Basic' NOT NULL CHECK (level IN ('Basic', 'Standard', 'Pro', 'Enterprise')),
  package_type TEXT DEFAULT 'Basic' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_email ON user_tokens(user_email);

-- ============================================
-- Tabel: token_transactions
-- ============================================
CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'spent', 'earned', 'transfer')),
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'completed' NOT NULL CHECK (status IN ('completed', 'pending', 'failed')),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT,
  tokens_received INTEGER,
  tokens_spent INTEGER,
  tokens_transferred INTEGER,
  recipient_email TEXT,
  recipient_name TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_email ON token_transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_token_transactions_date ON token_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(type);

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
-- Trigger: update user_tokens updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_user_tokens_updated_at ON user_tokens;
CREATE TRIGGER update_user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies pentru user_tokens
-- ============================================
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tokens" ON user_tokens;
CREATE POLICY "Users can view own tokens"
  ON user_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tokens" ON user_tokens;
CREATE POLICY "Users can insert own tokens"
  ON user_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tokens" ON user_tokens;
CREATE POLICY "Users can update own tokens"
  ON user_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin policies
DROP POLICY IF EXISTS "Admins can view all tokens" ON user_tokens;
CREATE POLICY "Admins can view all tokens"
  ON user_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update all tokens" ON user_tokens;
CREATE POLICY "Admins can update all tokens"
  ON user_tokens
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- ============================================
-- RLS Policies pentru token_transactions
-- ============================================
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON token_transactions;
CREATE POLICY "Users can view own transactions"
  ON token_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON token_transactions;
CREATE POLICY "Users can insert own transactions"
  ON token_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin policies
DROP POLICY IF EXISTS "Admins can view all transactions" ON token_transactions;
CREATE POLICY "Admins can view all transactions"
  ON token_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert all transactions" ON token_transactions;
CREATE POLICY "Admins can insert all transactions"
  ON token_transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

