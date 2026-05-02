-- Allow multiple runs per day (cron + manual), add source. Add settings for automation.

-- Drop UNIQUE on run_date so we can have manual + cron same day
ALTER TABLE healthcheck_runs DROP CONSTRAINT IF EXISTS healthcheck_runs_run_date_key;

-- Add source: 'cron' | 'manual'
ALTER TABLE healthcheck_runs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'cron';

CREATE INDEX IF NOT EXISTS idx_healthcheck_runs_source ON healthcheck_runs(source);

-- Single-row settings for automation (admin panel)
CREATE TABLE IF NOT EXISTS healthcheck_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_enabled boolean NOT NULL DEFAULT false,
  window_start_time time NOT NULL DEFAULT '03:00',  -- Europe/Bucharest preferred window start
  window_end_time time NOT NULL DEFAULT '05:00',    -- preferred window end
  postpone_minutes_min int NOT NULL DEFAULT 20,     -- if load high, retry after min (20-40)
  postpone_minutes_max int NOT NULL DEFAULT 40,
  load_threshold_ms int NOT NULL DEFAULT 4000,      -- if homepage response > this, consider busy
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE healthcheck_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO healthcheck_settings (id, auto_enabled, window_start_time, window_end_time, postpone_minutes_min, postpone_minutes_max, load_threshold_ms)
VALUES (1, false, '03:00', '05:00', 20, 40, 4000)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE healthcheck_settings IS 'Single row: automation on/off, time window, load threshold';
