-- Câmpuri din "Informatii aditionale" pentru subcategoriile Imobiliare
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS info_suprafata text,
  ADD COLUMN IF NOT EXISTS info_tip_imobil text,
  ADD COLUMN IF NOT EXISTS info_camere text,
  ADD COLUMN IF NOT EXISTS info_an_constructie text;

COMMENT ON COLUMN public.licitatii_insolventa_listings.info_suprafata IS 'Suprafata (mp) – Apartamente/Case/Cladiri/Terenuri/Spatii etc.';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_tip_imobil IS 'Tip imobil sau Tip teren (ex: garsoniera, apartament, intravilan)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_camere IS 'Numar camere (Apartamente si case)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.info_an_constructie IS 'An constructie (Imobiliare)';
