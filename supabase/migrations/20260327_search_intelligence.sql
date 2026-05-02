-- Search Intelligence layer: events, impressions, query stats, bucket weights, query boosts, arms

-- 1) search_events: click/satisfaction events linked to impressions
CREATE TABLE IF NOT EXISTS search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  impression_id uuid,
  q_norm text,
  session_id text,
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure column exists if table was created by an earlier migration
ALTER TABLE search_events ADD COLUMN IF NOT EXISTS impression_id uuid;

CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_q_norm_created ON search_events (q_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_impression_id ON search_events (impression_id);

-- 2) search_impressions: authoritative impression log (impression_id is PK)
CREATE TABLE IF NOT EXISTS search_impressions (
  impression_id uuid PRIMARY KEY,
  q_norm text NOT NULL,
  intent_bucket text NOT NULL,
  arm text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_impressions_created ON search_impressions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_impressions_q_norm_created ON search_impressions (q_norm, created_at DESC);

-- 3) search_intel_query_stats: daily aggregated stats per query
CREATE TABLE IF NOT EXISTS search_intel_query_stats (
  q_norm text NOT NULL,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  long_clicks int NOT NULL DEFAULT 0,
  pogo_clicks int NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  long_ctr numeric NOT NULL DEFAULT 0,
  pogo_rate numeric NOT NULL DEFAULT 0,
  top_clicked_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (q_norm, day)
);

-- 4) search_intel_bucket_weights: rerank weights per intent bucket
CREATE TABLE IF NOT EXISTS search_intel_bucket_weights (
  bucket text PRIMARY KEY,
  w_lex numeric NOT NULL DEFAULT 0.45,
  w_sem numeric NOT NULL DEFAULT 0.35,
  w_graph numeric NOT NULL DEFAULT 0.15,
  w_fresh numeric NOT NULL DEFAULT 0.05,
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Trigger updated_at for search_intel_bucket_weights
CREATE OR REPLACE FUNCTION set_search_intel_bucket_weights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_search_intel_bucket_weights_updated ON search_intel_bucket_weights;
CREATE TRIGGER tr_search_intel_bucket_weights_updated
  BEFORE UPDATE ON search_intel_bucket_weights
  FOR EACH ROW EXECUTE FUNCTION set_search_intel_bucket_weights_updated_at();

-- 5) search_intel_query_boosts: per-query multiplicative boosts (category/county/node)
CREATE TABLE IF NOT EXISTS search_intel_query_boosts (
  q_norm text PRIMARY KEY,
  boost jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION set_search_intel_query_boosts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_search_intel_query_boosts_updated ON search_intel_query_boosts;
CREATE TRIGGER tr_search_intel_query_boosts_updated
  BEFORE UPDATE ON search_intel_query_boosts
  FOR EACH ROW EXECUTE FUNCTION set_search_intel_query_boosts_updated_at();

-- 6) search_intel_arms: A/B arms (bucket + weights snapshot, performance counters)
CREATE TABLE IF NOT EXISTS search_intel_arms (
  arm text PRIMARY KEY,
  bucket text NOT NULL,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  long_clicks int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_search_intel_arms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_search_intel_arms_updated ON search_intel_arms;
CREATE TRIGGER tr_search_intel_arms_updated
  BEFORE UPDATE ON search_intel_arms
  FOR EACH ROW EXECUTE FUNCTION set_search_intel_arms_updated_at();

-- Seed default bucket weights and default arm
INSERT INTO search_intel_bucket_weights (bucket, w_lex, w_sem, w_graph, w_fresh)
VALUES ('default', 0.45, 0.35, 0.15, 0.05)
ON CONFLICT (bucket) DO NOTHING;

INSERT INTO search_intel_arms (arm, bucket, weights)
VALUES ('mix_a', 'default', '{"w_lex":0.45,"w_sem":0.35,"w_graph":0.15,"w_fresh":0.05}'::jsonb)
ON CONFLICT (arm) DO NOTHING;
