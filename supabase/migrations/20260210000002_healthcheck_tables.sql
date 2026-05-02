-- Site Health Monitor: runs, checks, incidents
-- Run once; safe to re-run (IF NOT EXISTS / create only).

-- A) healthcheck_runs: one row per daily run
CREATE TABLE IF NOT EXISTS healthcheck_runs (
  id bigserial PRIMARY KEY,
  run_date date NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  now_ro timestamptz,
  ok boolean NOT NULL DEFAULT false,
  total int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  env text,
  version text
);

CREATE INDEX IF NOT EXISTS idx_healthcheck_runs_run_date ON healthcheck_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_healthcheck_runs_started_at ON healthcheck_runs(started_at DESC);

-- B) healthcheck_checks: one row per check (exact location, result, suggestion)
CREATE TABLE IF NOT EXISTS healthcheck_checks (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES healthcheck_runs(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  target_url text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  expected jsonb,
  status int,
  ok boolean NOT NULL DEFAULT false,
  duration_ms int,
  error_code text,
  error_message text,
  response_snippet text,
  suggestion_key text,
  suggestion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_healthcheck_checks_run_id ON healthcheck_checks(run_id);
CREATE INDEX IF NOT EXISTS idx_healthcheck_checks_category ON healthcheck_checks(category);
CREATE INDEX IF NOT EXISTS idx_healthcheck_checks_ok ON healthcheck_checks(ok);
CREATE INDEX IF NOT EXISTS idx_healthcheck_checks_suggestion_key ON healthcheck_checks(suggestion_key);

-- C) healthcheck_incidents: group repeated failures
CREATE TABLE IF NOT EXISTS healthcheck_incidents (
  id bigserial PRIMARY KEY,
  first_seen_run_id bigint REFERENCES healthcheck_runs(id) ON DELETE SET NULL,
  last_seen_run_id bigint REFERENCES healthcheck_runs(id) ON DELETE SET NULL,
  fingerprint text NOT NULL UNIQUE,
  occurrences int NOT NULL DEFAULT 1,
  severity text NOT NULL DEFAULT 'warn',
  status text NOT NULL DEFAULT 'open',
  title text,
  recommendation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_healthcheck_incidents_status ON healthcheck_incidents(status);
CREATE INDEX IF NOT EXISTS idx_healthcheck_incidents_fingerprint ON healthcheck_incidents(fingerprint);

-- RLS: allow service role full access; anon no access (admin reads via API with service role)
ALTER TABLE healthcheck_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcheck_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcheck_incidents ENABLE ROW LEVEL SECURITY;

-- No policies: only service_role (used in API) bypasses RLS and has access.

COMMENT ON TABLE healthcheck_runs IS 'Site health monitor: one row per daily cron run';
COMMENT ON TABLE healthcheck_checks IS 'Per-check results with exact URL, status, duration, suggestion';
COMMENT ON TABLE healthcheck_incidents IS 'Grouped recurring failures by fingerprint';
