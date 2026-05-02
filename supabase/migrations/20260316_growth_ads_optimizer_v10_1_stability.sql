-- Enterprise Optimizer v10.1: Stability Mode (conservative scaling, cooling period, capital protection)
INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_min_days_between_budget_changes', '7', now()),
  ('ads_min_days_between_bid_changes', '5', now())
ON CONFLICT (key) DO NOTHING;
