-- Enterprise Optimizer ops: kill switches, daily orchestration
INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_optimizer_enabled', 'true', now()),
  ('ads_optimizer_auto_apply_enabled', 'true', now()),
  ('ads_optimizer_kill_campaign_ids', '[]', now()),
  ('ads_optimizer_daily_hour', '9', now()),
  ('ads_optimizer_last_daily_key', '""', now()),
  ('ads_optimizer_pilot_campaign_ids', '[]', now())
ON CONFLICT (key) DO NOTHING;
