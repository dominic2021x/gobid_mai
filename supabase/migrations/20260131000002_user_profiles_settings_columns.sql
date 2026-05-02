-- Coloane lipsă pentru setări executor/lichidator: city, country, postal_code, licitator_*
-- (settings page și my-products salvează aceste câmpuri)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS licitator_name text,
  ADD COLUMN IF NOT EXISTS licitator_address text,
  ADD COLUMN IF NOT EXISTS licitator_fiscal_code text,
  ADD COLUMN IF NOT EXISTS licitator_consignment_account text,
  ADD COLUMN IF NOT EXISTS licitator_email text,
  ADD COLUMN IF NOT EXISTS licitator_phone text,
  ADD COLUMN IF NOT EXISTS licitator_fax text,
  ADD COLUMN IF NOT EXISTS licitator_competence text;

COMMENT ON COLUMN public.user_profiles.city IS 'Oraș / localitate utilizator';
COMMENT ON COLUMN public.user_profiles.country IS 'Țara utilizatorului';
COMMENT ON COLUMN public.user_profiles.postal_code IS 'Cod poștal';
COMMENT ON COLUMN public.user_profiles.licitator_name IS 'Nume persoană de contact (licitator)';
COMMENT ON COLUMN public.user_profiles.licitator_address IS 'Adresă contact licitator';
COMMENT ON COLUMN public.user_profiles.licitator_fiscal_code IS 'CUI/CIF contact licitator';
COMMENT ON COLUMN public.user_profiles.licitator_consignment_account IS 'Cont de consignare licitator';
COMMENT ON COLUMN public.user_profiles.licitator_email IS 'Email contact licitator';
COMMENT ON COLUMN public.user_profiles.licitator_phone IS 'Telefon contact licitator';
COMMENT ON COLUMN public.user_profiles.licitator_fax IS 'Fax contact licitator';
COMMENT ON COLUMN public.user_profiles.licitator_competence IS 'Competență/teritoriu licitator';
