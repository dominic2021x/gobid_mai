-- Add schedule_days to healthcheck_settings (which days to run: 0=Sun, 1=Mon, ... 6=Sat, comma-separated)
ALTER TABLE healthcheck_settings ADD COLUMN IF NOT EXISTS schedule_days text NOT NULL DEFAULT '1,3,5';

COMMENT ON COLUMN healthcheck_settings.schedule_days IS 'Comma-separated weekday numbers (0=Sun..6=Sat). Default 1,3,5 = Mon, Wed, Fri.';

UPDATE healthcheck_settings SET schedule_days = '1,3,5' WHERE id = 1 AND (schedule_days IS NULL OR schedule_days = '');
