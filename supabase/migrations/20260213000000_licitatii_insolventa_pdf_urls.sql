-- Toate PDF-urile din secțiunea Documente (un anunț poate avea mai multe)
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS pdf_urls jsonb;

COMMENT ON COLUMN public.licitatii_insolventa_listings.pdf_urls IS 'Lista de URL-uri PDF din Documente (array JSON). pdf_url = primul pentru compatibilitate.';
