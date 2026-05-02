-- Asigură existența coloanelor pentru licitatii_insolventa_listings (dacă migrările anterioare nu au rulat)
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS meta_fields jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pdf_urls jsonb;

COMMENT ON COLUMN public.licitatii_insolventa_listings.meta_fields IS 'Toate câmpurile din Informații adiționale (label -> value)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.pdf_urls IS 'Lista de URL-uri PDF din Documente (array JSON)';
