-- Personal Search Agent (opt-in): profiles, opt-in flag, rollup

-- 0) Allow linking impressions to user (for rollup)
ALTER TABLE search_impressions ADD COLUMN IF NOT EXISTS user_id uuid;

-- 1) user_search_profiles: prefs (category/county/query weights)
CREATE TABLE IF NOT EXISTS user_search_profiles (
  user_id uuid PRIMARY KEY,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_search_profiles_updated ON user_search_profiles (updated_at DESC);

-- 2) search_personal_opt_in: per-user opt-in
CREATE TABLE IF NOT EXISTS search_personal_opt_in (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_personal_opt_in_updated ON search_personal_opt_in (updated_at DESC);

-- 3) user_search_events_rollup: daily aggregates (no raw history)
CREATE TABLE IF NOT EXISTS user_search_events_rollup (
  user_id uuid NOT NULL,
  day date NOT NULL,
  top_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_counties jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_user_search_events_rollup_day ON user_search_events_rollup (day DESC);
