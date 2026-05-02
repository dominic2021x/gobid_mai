-- Growth Guardrails Engine: prevent automated growth systems from causing instability

CREATE TABLE IF NOT EXISTS growth_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardrail_type text NOT NULL,
  scope text NOT NULL DEFAULT 'all',
  metric text NOT NULL,
  min_value numeric,
  max_value numeric,
  action text NOT NULL DEFAULT 'block' CHECK (action IN ('allow', 'warn', 'block')),
  enabled boolean NOT NULL DEFAULT true,
  applies_to_job_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_guardrails_enabled
  ON growth_guardrails (enabled) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS growth_guardrail_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardrail_id uuid NOT NULL REFERENCES growth_guardrails(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  metric_value numeric,
  decision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_guardrail_violations_created
  ON growth_guardrail_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_guardrail_violations_guardrail
  ON growth_guardrail_violations (guardrail_id);

-- Index for guardrail metrics: count events by type and time
CREATE INDEX IF NOT EXISTS idx_growth_events_type_created
  ON growth_events (type, created_at DESC);

-- Example: limit pseo_generate_candidates to 5 runs per hour
INSERT INTO growth_guardrails (guardrail_type, scope, metric, min_value, max_value, action, applies_to_job_types)
SELECT 'rate_limit', 'pseo', 'runs_last_hour', NULL, 5, 'block', ARRAY['pseo_generate_candidates']
WHERE NOT EXISTS (SELECT 1 FROM growth_guardrails WHERE guardrail_type = 'rate_limit' AND metric = 'runs_last_hour' AND scope = 'pseo');
