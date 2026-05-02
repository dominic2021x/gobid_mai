-- Add meta_fields JSONB to store all "Informatii aditionale" key-value pairs
-- (Data licitatie, Ora licitatie, Tip Vanzare, Marca, KM, Combustibil, etc. - depinde de categorie/anunț)
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS meta_fields jsonb DEFAULT '{}';

COMMENT ON COLUMN public.licitatii_insolventa_listings.meta_fields IS 'Toate câmpurile din Informații adiționale (label -> value), ex: Data licitatie, Marca, KM, Combustibil';
