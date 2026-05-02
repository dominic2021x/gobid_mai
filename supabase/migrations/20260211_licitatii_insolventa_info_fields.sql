-- Câmpuri din "Informatii aditionale" (comune la Auto/Imobiliare etc.)
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS info_marca text,
  ADD COLUMN IF NOT EXISTS info_km text,
  ADD COLUMN IF NOT EXISTS info_combustibil text,
  ADD COLUMN IF NOT EXISTS info_an_fabricatie text,
  ADD COLUMN IF NOT EXISTS info_capacitate_cilindrica text;

COMMENT ON COLUMN public.licitatii_insolventa_listings.info_marca IS 'Marca (din Informatii aditionale)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_km IS 'KM (din Informatii aditionale)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_combustibil IS 'Combustibil (din Informatii aditionale)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_an_fabricatie IS 'An fabricatie (din Informatii aditionale)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_capacitate_cilindrica IS 'Capacitate cilindrica (din Informatii aditionale)';
