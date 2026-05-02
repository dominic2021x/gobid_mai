-- Enterprise Optimizer v3: target CPA guardrail, extended auto-apply modes (value remains string in growth_settings)

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_max_target_cpa_change_pct', '15', now())
ON CONFLICT (key) DO NOTHING;
