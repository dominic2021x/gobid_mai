-- Suport pentru mai multe PDF-uri per anunț REPES.
ALTER TABLE public.repes_listings ADD COLUMN IF NOT EXISTS pdf_urls jsonb DEFAULT '[]'::jsonb;

-- Backfill: pune pdf_url existent în pdf_urls dacă e gol
UPDATE public.repes_listings
SET pdf_urls = jsonb_build_array(pdf_url)
WHERE pdf_url IS NOT NULL AND pdf_url <> ''
  AND (pdf_urls IS NULL OR pdf_urls = '[]'::jsonb);

COMMENT ON COLUMN public.repes_listings.pdf_urls IS 'Lista de URL-uri PDF (array JSON). pdf_url = primul pentru compatibilitate.';
