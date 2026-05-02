-- Demand → Search → SEO Flywheel: actions and feedback

-- 1) Actions produced by demand_flywheel_refresh, consumed by demand_flywheel_execute
CREATE TABLE IF NOT EXISTS growth_demand_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('create_lp', 'improve_lp', 'seed_links', 'suggest_listing')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'skipped')),
  q_norm text,
  demand_score numeric,
  supply_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_demand_actions_status ON growth_demand_actions (status);
CREATE INDEX IF NOT EXISTS idx_growth_demand_actions_created ON growth_demand_actions (created_at DESC);

-- Deduplication: one pending action per (type, q_norm)
CREATE UNIQUE INDEX IF NOT EXISTS growth_demand_actions_unique_pending
  ON growth_demand_actions (type, q_norm)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION demand_flywheel_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_growth_demand_actions_updated ON growth_demand_actions;
CREATE TRIGGER tr_growth_demand_actions_updated
  BEFORE UPDATE ON growth_demand_actions
  FOR EACH ROW EXECUTE FUNCTION demand_flywheel_set_updated_at();

-- 2) Feedback / audit for executed actions
CREATE TABLE IF NOT EXISTS growth_demand_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid REFERENCES growth_demand_actions(id) ON DELETE SET NULL,
  type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_demand_feedback_created ON growth_demand_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_demand_feedback_action ON growth_demand_feedback (action_id);
