-- Enterprise Optimizer v2: new guardrail and auto-apply settings

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_min_conversions_for_budget_increase', '5', now()),
  ('ads_cap_spend_per_day_micros', '0', now()),
  ('ads_auto_apply_mode', '"off"', now()),
  ('ads_min_readiness_for_full_plan', '0.3', now())
ON CONFLICT (key) DO NOTHING;
