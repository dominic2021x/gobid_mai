-- IPS (Inverse Propensity Scoring) debiasing: position propensity and arm IPS stats

-- 1) Position propensity: p_view per position (1..30), decreasing
CREATE TABLE IF NOT EXISTS search_intel_position_propensity (
  pos int PRIMARY KEY,
  p_view numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed pos 1..30 with decreasing p_view (e.g. 0.95 down to ~0.08)
INSERT INTO search_intel_position_propensity (pos, p_view) VALUES
  (1, 0.95), (2, 0.88), (3, 0.82), (4, 0.76), (5, 0.70), (6, 0.65), (7, 0.60), (8, 0.55), (9, 0.50), (10, 0.46),
  (11, 0.42), (12, 0.38), (13, 0.35), (14, 0.32), (15, 0.29), (16, 0.26), (17, 0.24), (18, 0.22), (19, 0.20), (20, 0.18),
  (21, 0.16), (22, 0.14), (23, 0.13), (24, 0.12), (25, 0.11), (26, 0.10), (27, 0.09), (28, 0.085), (29, 0.08), (30, 0.08)
ON CONFLICT (pos) DO NOTHING;

-- 2) Add IPS reward columns to search_intel_arms
ALTER TABLE search_intel_arms ADD COLUMN IF NOT EXISTS ips_click_reward numeric NOT NULL DEFAULT 0;
ALTER TABLE search_intel_arms ADD COLUMN IF NOT EXISTS ips_long_reward numeric NOT NULL DEFAULT 0;
ALTER TABLE search_intel_arms ADD COLUMN IF NOT EXISTS ips_pogo_penalty numeric NOT NULL DEFAULT 0;

-- 3) Optional: daily arm stats for IPS
CREATE TABLE IF NOT EXISTS search_intel_arm_stats_daily (
  day date NOT NULL,
  bucket text NOT NULL,
  arm text NOT NULL,
  ips_click_reward numeric NOT NULL DEFAULT 0,
  ips_long_reward numeric NOT NULL DEFAULT 0,
  ips_pogo_penalty numeric NOT NULL DEFAULT 0,
  impressions int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket, arm)
);

CREATE INDEX IF NOT EXISTS idx_search_intel_arm_stats_daily_day ON search_intel_arm_stats_daily (day DESC);
