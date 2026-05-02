-- Growth Center: integrations, settings, jobs, job_runs, audit_results, events
-- Admin-only access via service role (createAdminClient); no client-side direct reads.

-- Integrations (OAuth tokens stored encrypted)
CREATE TABLE IF NOT EXISTS growth_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text UNIQUE NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  token_encrypted text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Settings (GTM_ID, GA4_ID, dry_run, rate limits, etc.)
CREATE TABLE IF NOT EXISTS growth_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Job queue
CREATE TABLE IF NOT EXISTS growth_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued', -- queued | locked | done | failed
  attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz NULL,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_jobs_status_run_after_created
  ON growth_jobs (status, run_after, created_at);

-- Job run history (one row per execution attempt)
CREATE TABLE IF NOT EXISTS growth_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES growth_jobs(id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  ok boolean NULL,
  error text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_growth_job_runs_job_started
  ON growth_job_runs (job_id, started_at DESC);

-- Audit results cache (e.g. seo_audit_run)
CREATE TABLE IF NOT EXISTS growth_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_audit_results_kind_created
  ON growth_audit_results (kind, created_at DESC);

-- Events (optional audit trail)
CREATE TABLE IF NOT EXISTS growth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: update updated_at on growth_integrations
CREATE OR REPLACE FUNCTION growth_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS growth_integrations_updated_at ON growth_integrations;
CREATE TRIGGER growth_integrations_updated_at
  BEFORE UPDATE ON growth_integrations
  FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

DROP TRIGGER IF EXISTS growth_settings_updated_at ON growth_settings;
CREATE TRIGGER growth_settings_updated_at
  BEFORE UPDATE ON growth_settings
  FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

DROP TRIGGER IF EXISTS growth_jobs_updated_at ON growth_jobs;
CREATE TRIGGER growth_jobs_updated_at
  BEFORE UPDATE ON growth_jobs
  FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

-- RLS: disable so only service role (createAdminClient) can access; no anon/authenticated policies.
ALTER TABLE growth_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_events ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role bypasses RLS. Client never reads these tables directly.

-- Atomic lock next queued job (called by worker)
CREATE OR REPLACE FUNCTION growth_lock_next_job()
RETURNS growth_jobs AS $$
DECLARE
  row growth_jobs%ROWTYPE;
BEGIN
  SELECT * INTO row
  FROM growth_jobs
  WHERE status = 'queued' AND run_after <= now()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE growth_jobs
  SET status = 'locked', locked_at = now(), attempts = attempts + 1, updated_at = now()
  WHERE id = row.id;

  SELECT * INTO row FROM growth_jobs WHERE id = row.id;
  RETURN row;
END;
$$ LANGUAGE plpgsql;
