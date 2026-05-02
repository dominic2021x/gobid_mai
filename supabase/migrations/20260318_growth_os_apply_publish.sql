-- Growth OS Apply & Publish: seo_overrides, seo_landing_pages, growth_content_items
-- Admin/service-role only (createAdminClient). No RLS policies for client reads on these.

-- SEO title/meta overrides (applied by seo_apply_overrides job)
CREATE TABLE IF NOT EXISTS seo_overrides (
  url text PRIMARY KEY,
  title text,
  meta text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Landing pages (draft -> review -> published; public route /ro/lp/[slug])
CREATE TABLE IF NOT EXISTS seo_landing_pages (
  slug text PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title text,
  meta text,
  h1 text,
  intro_md text,
  faq_json jsonb DEFAULT '[]'::jsonb,
  filters_json jsonb DEFAULT '{}'::jsonb,
  canonical_url text,
  noindex boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_landing_pages_status ON seo_landing_pages (status);

-- Editorial content items (briefs, draft markdown, publish workflow)
CREATE TABLE IF NOT EXISTS growth_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title text,
  slug text,
  brief jsonb DEFAULT '{}'::jsonb,
  draft_md text,
  meta_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_content_items_status ON growth_content_items (status);
CREATE INDEX IF NOT EXISTS idx_growth_content_items_slug ON growth_content_items (slug) WHERE slug IS NOT NULL;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION growth_os_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_seo_overrides_updated ON seo_overrides;
CREATE TRIGGER tr_seo_overrides_updated
  BEFORE UPDATE ON seo_overrides
  FOR EACH ROW EXECUTE FUNCTION growth_os_set_updated_at();

DROP TRIGGER IF EXISTS tr_seo_landing_pages_updated ON seo_landing_pages;
CREATE TRIGGER tr_seo_landing_pages_updated
  BEFORE UPDATE ON seo_landing_pages
  FOR EACH ROW EXECUTE FUNCTION growth_os_set_updated_at();

DROP TRIGGER IF EXISTS tr_growth_content_items_updated ON growth_content_items;
CREATE TRIGGER tr_growth_content_items_updated
  BEFORE UPDATE ON growth_content_items
  FOR EACH ROW EXECUTE FUNCTION growth_os_set_updated_at();
