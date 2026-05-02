-- ===============================================================
-- Supabase Migration: REPES / Executări publice (prod.executori.ro/repes)
-- ===============================================================
-- Listings sync from https://prod.executori.ro/repes
-- Same pattern as licitatii_insolventa_listings.

-- ============================================
-- Tabel: repes_listings
-- ============================================
CREATE TABLE IF NOT EXISTS public.repes_listings (
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
  seller_email text,
  seller_phone text,
  seller_address text,
  published_at timestamptz,
  auction_date timestamptz,
  auction_time text,
  sale_type text,
  pdf_url text,
  meta_fields jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz,
  reactivated_at timestamptz,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_repes_source_external_id UNIQUE (source_external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repes_source_external_id ON public.repes_listings(source_external_id);
CREATE INDEX IF NOT EXISTS idx_repes_location_county ON public.repes_listings(location_county);
CREATE INDEX IF NOT EXISTS idx_repes_deleted_at ON public.repes_listings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_repes_last_seen_at ON public.repes_listings(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_repes_product_id ON public.repes_listings(product_id);

-- ============================================
-- Tabel: repes_listing_images
-- ============================================
CREATE TABLE IF NOT EXISTS public.repes_listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.repes_listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_repes_images_listing ON public.repes_listing_images(listing_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_repes_listings_updated_at ON public.repes_listings;
CREATE TRIGGER trg_repes_listings_updated_at
  BEFORE UPDATE ON public.repes_listings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RLS
ALTER TABLE public.repes_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repes_listing_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repes_listings' AND policyname = 'Admins manage repes listings') THEN
    CREATE POLICY "Admins manage repes listings" ON public.repes_listings
      USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repes_listings' AND policyname = 'Anyone can view non-deleted repes listings') THEN
    CREATE POLICY "Anyone can view non-deleted repes listings" ON public.repes_listings
      FOR SELECT USING (deleted_at IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repes_listing_images' AND policyname = 'Admins manage repes images') THEN
    CREATE POLICY "Admins manage repes images" ON public.repes_listing_images
      USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.is_admin = true)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repes_listing_images' AND policyname = 'Anyone can view repes images') THEN
    CREATE POLICY "Anyone can view repes images" ON public.repes_listing_images
      FOR SELECT USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.repes_listings IS 'Anunțuri sincronizate de pe prod.executori.ro/repes (execuții publice); soft-delete când dispar din listare';
