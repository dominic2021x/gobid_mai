-- Internal Linking Engine: seo_internal_links
-- Admin/service-role only. Public read for status=applied (runtime "Resurse utile").

CREATE TABLE IF NOT EXISTS seo_internal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  target_url text NOT NULL,
  anchor text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_internal_links_source_status ON seo_internal_links (source_url, status);
CREATE INDEX IF NOT EXISTS idx_seo_internal_links_status ON seo_internal_links (status);

CREATE OR REPLACE FUNCTION seo_internal_links_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_seo_internal_links_updated ON seo_internal_links;
CREATE TRIGGER tr_seo_internal_links_updated
  BEFORE UPDATE ON seo_internal_links
  FOR EACH ROW EXECUTE FUNCTION seo_internal_links_set_updated_at();
