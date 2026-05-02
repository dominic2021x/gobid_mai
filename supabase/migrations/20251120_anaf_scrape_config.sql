-- Migration: ANAF Scrape Configuration
-- Creează tabel pentru configurarea URL-urilor de scraping ANAF

CREATE TABLE IF NOT EXISTS anaf_scrape_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  max_pages INTEGER DEFAULT 10,
  last_scraped_at TIMESTAMPTZ,
  last_scraped_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anaf_scrape_config_enabled ON anaf_scrape_config(enabled);
CREATE INDEX IF NOT EXISTS idx_anaf_scrape_config_url ON anaf_scrape_config(url);

-- Comentarii
COMMENT ON TABLE anaf_scrape_config IS 'Configurație URL-uri pentru scraping automat ANAF';
COMMENT ON COLUMN anaf_scrape_config.url IS 'URL-ul paginii ANAF de scrapat';
COMMENT ON COLUMN anaf_scrape_config.enabled IS 'Dacă URL-ul este activ pentru scraping';
COMMENT ON COLUMN anaf_scrape_config.max_pages IS 'Numărul maxim de pagini de parcurs';
COMMENT ON COLUMN anaf_scrape_config.last_scraped_at IS 'Data ultimei scanări';
COMMENT ON COLUMN anaf_scrape_config.last_scraped_count IS 'Numărul de anunțuri găsite la ultima scanare';



