-- Enterprise Optimizer v5: CPC Efficiency + Traffic Quality

INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('ads_network_cost_threshold_micros', '500000', now()),
  ('ads_allow_disable_search_partners', 'false', now()),
  ('ads_allow_pause_keyword', 'false', now()),
  ('traffic_quality_click_session_ratio_threshold', '1.7', now()),
  ('traffic_quality_min_sessions', '20', now())
ON CONFLICT (key) DO NOTHING;
