-- Enterprise Optimizer v9: Conversion System Optimization
-- avg_revenue_per_listing: 0 = off; target_margin as decimal (0.2 = 20%); funnel_drop_threshold_pct; keyword_mining_clicks_threshold

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('avg_revenue_per_listing', '0', now()),
  ('target_margin', '0.2', now()),
  ('funnel_drop_threshold_pct', '40', now()),
  ('keyword_mining_clicks_threshold', '20', now())
ON CONFLICT (key) DO NOTHING;
