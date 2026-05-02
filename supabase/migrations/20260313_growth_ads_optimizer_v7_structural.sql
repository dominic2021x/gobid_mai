-- Enterprise Optimizer v7: Structural & Bidding Efficiency
-- value is jsonb: use valid JSON (strings in double quotes, numbers unquoted)

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_primary_objective', '"CPA_MIN"', now()),
  ('ads_search_term_overlap_threshold', '3', now()),
  ('ads_click_quality_index_threshold', '0.5', now())
ON CONFLICT (key) DO NOTHING;
