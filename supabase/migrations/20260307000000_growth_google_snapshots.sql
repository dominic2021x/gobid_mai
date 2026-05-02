-- Snapshots for Google Hub operational results (Ads reports, GSC performance, GA4 reports)

CREATE TABLE IF NOT EXISTS growth_google_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  kind text NOT NULL,
  scope_ref text NOT NULL DEFAULT '',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_google_snapshots_product_kind_created
  ON growth_google_snapshots (product, kind, created_at DESC);

ALTER TABLE growth_google_snapshots ENABLE ROW LEVEL SECURITY;
