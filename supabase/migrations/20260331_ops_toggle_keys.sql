-- Optional toggle keys for Ops Console (growth_os_enabled, pseo_enabled)
-- Defaults: true (enabled)

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('growth_os_enabled', 'true', now()),
  ('pseo_enabled', 'true', now())
ON CONFLICT (key) DO NOTHING;
