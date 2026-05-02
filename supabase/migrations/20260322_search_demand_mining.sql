-- Search Demand Mining Engine (Growth OS)

-- 1) Internal search queries (populated by app when users search)
CREATE TABLE IF NOT EXISTS search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q text NOT NULL,
  q_norm text NOT NULL,
  results_count int,
  source text,
  user_id uuid,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at_desc ON search_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_q_norm_created_at ON search_queries (q_norm, created_at DESC);

-- 2) Demand snapshots (merged ranked output from job)
CREATE TABLE IF NOT EXISTS growth_demand_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  scope_ref text,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_demand_snapshots_kind_created ON growth_demand_snapshots (kind, created_at DESC);

-- 3) Demand opportunities (upserted by job, actionable)
CREATE TABLE IF NOT EXISTS growth_demand_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_norm text UNIQUE NOT NULL,
  examples text[] NOT NULL DEFAULT '{}',
  intent text,
  county_slug text,
  category_slug text,
  demand_score numeric NOT NULL,
  source_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL,
  target_slug text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'done', 'ignored')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_demand_opportunities_status_score ON growth_demand_opportunities (status, demand_score DESC);

CREATE OR REPLACE FUNCTION growth_demand_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_growth_demand_opportunities_updated ON growth_demand_opportunities;
CREATE TRIGGER tr_growth_demand_opportunities_updated
  BEFORE UPDATE ON growth_demand_opportunities
  FOR EACH ROW EXECUTE FUNCTION growth_demand_set_updated_at();
