-- Google Hub: multi-product integrations (provider + product), keep growth_settings for selections

-- 1) Add product column and switch to (provider, product) unique
ALTER TABLE growth_integrations
  DROP CONSTRAINT IF EXISTS growth_integrations_provider_key;

ALTER TABLE growth_integrations
  ADD COLUMN IF NOT EXISTS product text;

-- Migrate existing single-provider row: google_search_console -> provider='google', product='search_console'
UPDATE growth_integrations
SET provider = 'google', product = 'search_console'
WHERE provider = 'google_search_console';

-- Ensure product is not null for new rows (existing row already updated)
UPDATE growth_integrations SET product = 'search_console' WHERE product IS NULL;

ALTER TABLE growth_integrations
  ALTER COLUMN product SET NOT NULL;

-- Default provider to 'google' for existing rows if needed (already set above)
ALTER TABLE growth_integrations
  ALTER COLUMN provider SET DEFAULT 'google';

CREATE UNIQUE INDEX IF NOT EXISTS growth_integrations_provider_product_key
  ON growth_integrations (provider, product);

-- 2) growth_settings keys (no schema change; keys used: gsc_site_url, google_ads_customer_id, ga4_property_id, gtm_container_id)
-- Optional: insert empty string defaults so UI can read them
INSERT INTO growth_settings (key, value, updated_at)
VALUES
  ('gsc_site_url', '""', now()),
  ('google_ads_customer_id', '""', now()),
  ('ga4_property_id', '""', now()),
  ('gtm_container_id', '""', now())
ON CONFLICT (key) DO NOTHING;
