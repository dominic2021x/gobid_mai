-- SEO Flywheel v1: CTR experiments, hub pages, and optional meta_json for strikes on landing pages

-- CTR A/B experiments
CREATE TABLE IF NOT EXISTS seo_ctr_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url text NOT NULL,
  variant_a jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant_b jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running_a', 'running_b', 'done')),
  started_at timestamptz,
  winner text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_ctr_experiments_page_url ON seo_ctr_experiments (page_url);
CREATE INDEX IF NOT EXISTS idx_seo_ctr_experiments_state ON seo_ctr_experiments (state);

-- Hub pages (e.g. /ro/hub/autovehicule)
CREATE TABLE IF NOT EXISTS seo_hub_pages (
  slug text PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title text,
  meta text,
  h1 text,
  intro_md text,
  links_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  noindex boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_hub_pages_status ON seo_hub_pages (status);

-- Optional: meta_json on seo_landing_pages for demotion strikes (lock after repeated demotions)
ALTER TABLE seo_landing_pages ADD COLUMN IF NOT EXISTS meta_json jsonb DEFAULT '{}'::jsonb;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS tr_seo_ctr_experiments_updated ON seo_ctr_experiments;
CREATE TRIGGER tr_seo_ctr_experiments_updated
  BEFORE UPDATE ON seo_ctr_experiments
  FOR EACH ROW EXECUTE FUNCTION growth_os_set_updated_at();

DROP TRIGGER IF EXISTS tr_seo_hub_pages_updated ON seo_hub_pages;
CREATE TRIGGER tr_seo_hub_pages_updated
  BEFORE UPDATE ON seo_hub_pages
  FOR EACH ROW EXECUTE FUNCTION growth_os_set_updated_at();
