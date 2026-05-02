-- Marketplace Trend Engine (Growth OS)

CREATE TABLE IF NOT EXISTS growth_trend_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_trend_snapshots_kind_created ON growth_trend_snapshots (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_trend_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  q_norm text NOT NULL,
  intent text,
  county_slug text,
  category_slug text,
  spike_score numeric NOT NULL,
  source_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'applied', 'ignored')),
  target_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_trend_items_status_score ON growth_trend_items (status, spike_score DESC);

CREATE OR REPLACE FUNCTION growth_trend_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_growth_trend_items_updated ON growth_trend_items;
CREATE TRIGGER tr_growth_trend_items_updated
  BEFORE UPDATE ON growth_trend_items
  FOR EACH ROW EXECUTE FUNCTION growth_trend_set_updated_at();

-- Settings defaults
INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('trends_spike_multiplier', '2.0', now()),
  ('trends_min_baseline', '10', now()),
  ('trends_max_items', '50', now()),
  ('trends_apply_create_lp_limit', '10', now()),
  ('trends_apply_seed_links_limit', '30', now())
ON CONFLICT (key) DO NOTHING;
