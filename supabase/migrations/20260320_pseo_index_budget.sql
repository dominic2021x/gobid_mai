-- Programmatic SEO: index budget control on seo_landing_pages

ALTER TABLE seo_landing_pages
  ADD COLUMN IF NOT EXISTS index_stage text NOT NULL DEFAULT 'draft'
    CHECK (index_stage IN ('draft', 'staged', 'indexable'));

ALTER TABLE seo_landing_pages
  ADD COLUMN IF NOT EXISTS gsc_impressions_28d int NOT NULL DEFAULT 0;

ALTER TABLE seo_landing_pages
  ADD COLUMN IF NOT EXISTS gsc_clicks_28d int NOT NULL DEFAULT 0;

ALTER TABLE seo_landing_pages
  ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_seo_landing_pages_index_stage ON seo_landing_pages (index_stage);
CREATE INDEX IF NOT EXISTS idx_seo_landing_pages_noindex ON seo_landing_pages (noindex);
