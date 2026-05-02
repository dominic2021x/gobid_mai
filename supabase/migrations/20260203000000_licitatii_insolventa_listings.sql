-- ===============================================================
-- Supabase Migration: Licitatii Insolventa (licitatii-insolventa.ro)
-- ===============================================================
-- Inventar sincronizat din https://www.licitatii-insolventa.ro/cauta
-- Sursa de adevăr: listing-ul /cauta; ștergerea soft pe baza crawl-ului complet.

-- ============================================
-- Tabel: licitatii_insolventa_listings
-- ============================================
CREATE TABLE IF NOT EXISTS public.licitatii_insolventa_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_external_id text NOT NULL,
  source_url text NOT NULL,
  title text,
  price_text text,
  category text,
  location_raw text,
  location_city text,
  location_county text,
  description_html text,
  seller_name text,
  seller_profile_url text,
  published_at timestamptz,
  auction_date timestamptz,
  auction_time text,
  sale_type text,
  pdf_url text,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_licitatii_insolventa_source_external_id UNIQUE (source_external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_licitatii_insolventa_source_external_id
  ON public.licitatii_insolventa_listings(source_external_id);
CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_location_county
  ON public.licitatii_insolventa_listings(location_county);
CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_location_city
  ON public.licitatii_insolventa_listings(location_city);
CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_deleted_at
  ON public.licitatii_insolventa_listings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_last_seen_at
  ON public.licitatii_insolventa_listings(last_seen_at);

-- ============================================
-- Tabel: licitatii_insolventa_listing_images
-- ============================================
CREATE TABLE IF NOT EXISTS public.licitatii_insolventa_listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.licitatii_insolventa_listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_images_listing
  ON public.licitatii_insolventa_listing_images(listing_id);

-- ============================================
-- Trigger updated_at
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = timezone('utc', now());
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_licitatii_insolventa_listings_updated_at ON public.licitatii_insolventa_listings;
CREATE TRIGGER trg_licitatii_insolventa_listings_updated_at
  BEFORE UPDATE ON public.licitatii_insolventa_listings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.licitatii_insolventa_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licitatii_insolventa_listing_images ENABLE ROW LEVEL SECURITY;

-- Listings: service_role sau admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'licitatii_insolventa_listings' AND policyname = 'Admins manage licitatii insolventa listings') THEN
    CREATE POLICY "Admins manage licitatii insolventa listings" ON public.licitatii_insolventa_listings
      USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'licitatii_insolventa_listings' AND policyname = 'Anyone can view non-deleted licitatii insolventa listings') THEN
    CREATE POLICY "Anyone can view non-deleted licitatii insolventa listings" ON public.licitatii_insolventa_listings
      FOR SELECT USING (deleted_at IS NULL);
  END IF;
END $$;

-- Images: same as listings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'licitatii_insolventa_listing_images' AND policyname = 'Admins manage licitatii insolventa images') THEN
    CREATE POLICY "Admins manage licitatii insolventa images" ON public.licitatii_insolventa_listing_images
      USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'licitatii_insolventa_listing_images' AND policyname = 'Anyone can view licitatii insolventa images') THEN
    CREATE POLICY "Anyone can view licitatii insolventa images" ON public.licitatii_insolventa_listing_images
      FOR SELECT USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.licitatii_insolventa_listings IS 'Anunțuri sincronizate de pe licitatii-insolventa.ro; soft-delete când dispar din /cauta';
COMMENT ON COLUMN public.licitatii_insolventa_listings.pdf_url IS 'URL document PDF (primul din pagina de detaliu)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.last_seen_at IS 'Ultima dată când anunțul a fost văzut pe /cauta; folosit pentru soft-delete';
