-- ============================================
-- Autopilot AI - Supabase Tables
-- ============================================
-- Rulează acest script în Supabase SQL Editor
-- pentru a crea tabelele necesare pentru Autopilot AI

-- ============================================
-- Tabel: autopilot_policies
-- ============================================
CREATE TABLE IF NOT EXISTS autopilot_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_policies_key ON autopilot_policies(key);

-- ============================================
-- Tabel: autopilot_tasks
-- ============================================
CREATE TABLE IF NOT EXISTS autopilot_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'queued',
  cost_usd NUMERIC DEFAULT 0,
  risk_score NUMERIC DEFAULT 0,
  risk_explanation TEXT,
  review_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_tasks_status ON autopilot_tasks(status);
CREATE INDEX IF NOT EXISTS idx_autopilot_tasks_created_at ON autopilot_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopilot_tasks_type ON autopilot_tasks(type);
CREATE INDEX IF NOT EXISTS idx_autopilot_tasks_risk_score ON autopilot_tasks(risk_score DESC);

-- Adaugă coloana risk_score dacă nu există (pentru tabele existente)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autopilot_tasks' AND column_name = 'risk_score'
  ) THEN
    ALTER TABLE autopilot_tasks ADD COLUMN risk_score NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autopilot_tasks' AND column_name = 'review_comment'
  ) THEN
    ALTER TABLE autopilot_tasks ADD COLUMN review_comment TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autopilot_tasks' AND column_name = 'risk_explanation'
  ) THEN
    ALTER TABLE autopilot_tasks ADD COLUMN risk_explanation TEXT;
  END IF;
END $$;

-- ============================================
-- Tabel: experiments
-- ============================================
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  item_id UUID NOT NULL,
  variant TEXT NOT NULL,
  metrics JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_experiments_item_id ON experiments(item_id);
CREATE INDEX IF NOT EXISTS idx_experiments_scope ON experiments(scope);
CREATE INDEX IF NOT EXISTS idx_experiments_finished_at ON experiments(finished_at);

-- ============================================
-- Tabel: spend_ledger
-- ============================================
CREATE TABLE IF NOT EXISTS spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL,
  service TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spend_ledger_day ON spend_ledger(day DESC);
CREATE INDEX IF NOT EXISTS idx_spend_ledger_service ON spend_ledger(service);

-- ============================================
-- Tabel: ai_logs
-- ============================================
CREATE TABLE IF NOT EXISTS ai_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  module TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'success')),
  message TEXT NOT NULL,
  details JSONB,
  duration NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_module ON ai_logs(module);
CREATE INDEX IF NOT EXISTS idx_ai_logs_timestamp ON ai_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_level ON ai_logs(level);
CREATE INDEX IF NOT EXISTS idx_ai_logs_module_timestamp ON ai_logs(module, timestamp DESC);

-- ============================================
-- Politici Implicite
-- ============================================
INSERT INTO autopilot_policies (key, value) VALUES
  ('daily_video_quota', '{"max": 1}'),
  ('max_email_per_day', '{"max": 1}'),
  ('min_ctr_to_scale', '{"value": 0.02}'),
  ('video_targets', '{"categories": ["imobiliare", "auto"], "priority": "imobiliare"}'),
  ('daily_task_limit', '{"value": 5}'),
  ('min_impact_score', '{"value": 2}')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Row Level Security (RLS) - Opțional
-- ============================================
-- Dacă vrei să restricționezi accesul, de-comentează:

-- ALTER TABLE autopilot_policies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE autopilot_tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE spend_ledger ENABLE ROW LEVEL SECURITY;

-- Policy pentru citire publică (opțional)
-- CREATE POLICY "Allow public read access" ON autopilot_policies
--   FOR SELECT USING (true);

-- CREATE POLICY "Allow public read access" ON autopilot_tasks
--   FOR SELECT USING (true);

-- CREATE POLICY "Allow public read access" ON experiments
--   FOR SELECT USING (true);

-- CREATE POLICY "Allow public read access" ON spend_ledger
--   FOR SELECT USING (true);

-- ============================================
-- Verificare
-- ============================================
-- Verifică dacă tabelele au fost create:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('autopilot_policies', 'autopilot_tasks', 'experiments', 'spend_ledger');

-- Verifică politici:
-- SELECT * FROM autopilot_policies;

