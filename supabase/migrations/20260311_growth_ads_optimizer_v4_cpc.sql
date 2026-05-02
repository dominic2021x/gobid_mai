-- Enterprise Optimizer v4 CPC Reduction: new settings

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_allow_pause_low_qs_keyword', 'false', now()),
  ('ads_max_bid_modifier_change_pct', '20', now()),
  ('ads_hourly_cost_threshold_micros', '1000000', now())
ON CONFLICT (key) DO NOTHING;
