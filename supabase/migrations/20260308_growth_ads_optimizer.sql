-- Ads Optimizer Agent: plans and plan runs

CREATE TABLE IF NOT EXISTS growth_ai_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  scope_ref text NOT NULL DEFAULT '',
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at on change
CREATE OR REPLACE FUNCTION growth_ai_plans_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS growth_ai_plans_updated_at ON growth_ai_plans;
CREATE TRIGGER growth_ai_plans_updated_at
  BEFORE UPDATE ON growth_ai_plans
  FOR EACH ROW EXECUTE FUNCTION growth_ai_plans_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_growth_ai_plans_product_scope_created
  ON growth_ai_plans (product, scope_ref, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_ai_plan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES growth_ai_plans(id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  ok boolean NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_ai_plan_runs_plan_id
  ON growth_ai_plan_runs (plan_id, created_at DESC);

ALTER TABLE growth_ai_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_ai_plan_runs ENABLE ROW LEVEL SECURITY;

-- Guardrail defaults (growth_settings)
INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_max_budget_change_pct', '20', now()),
  ('ads_max_actions_per_day', '25', now()),
  ('ads_allow_pause', 'false', now()),
  ('ads_allow_negatives', 'true', now()),
  ('ads_min_days_between_changes', '3', now())
ON CONFLICT (key) DO NOTHING;
