-- Enterprise Optimizer v10: Economic Control & Scaling Engine
-- LTV model: avg_revenue_per_user, repeat_purchase_rate, ads_scaling_risk_mode (conservative|balanced|aggressive)

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('avg_revenue_per_user', '0', now()),
  ('repeat_purchase_rate', '0', now()),
  ('ads_scaling_risk_mode', '"balanced"', now())
ON CONFLICT (key) DO NOTHING;
