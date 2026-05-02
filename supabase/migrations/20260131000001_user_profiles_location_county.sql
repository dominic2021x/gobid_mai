-- Adaugă location (localitate) și company_county (județ) în user_profiles
-- pentru datele detaliate la înregistrare (adresa, județ, localitate)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS company_county text;

COMMENT ON COLUMN public.user_profiles.location IS 'Localitate (oraș/sat) – utilizator privat sau general';
COMMENT ON COLUMN public.user_profiles.company_county IS 'Județ – utilizator privat sau firmă';
