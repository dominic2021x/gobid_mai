-- Coloane pentru executor/lichidator și company în user_profiles
-- (create-user pune datele în user_metadata; verify-code le scrie aici la confirmare email)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_registration_number text,
  ADD COLUMN IF NOT EXISTS executor_unej_number text,
  ADD COLUMN IF NOT EXISTS executor_chamber text,
  ADD COLUMN IF NOT EXISTS executor_office_address text,
  ADD COLUMN IF NOT EXISTS executor_office_location text,
  ADD COLUMN IF NOT EXISTS executor_website text;

COMMENT ON COLUMN public.user_profiles.company_city IS 'Oraș / localitate firmă sau sediu';
COMMENT ON COLUMN public.user_profiles.company_registration_number IS 'Număr înregistrare / CUI firmă';
COMMENT ON COLUMN public.user_profiles.executor_unej_number IS 'Număr UNEJ (executor) sau certificat/înregistrare (lichidator)';
COMMENT ON COLUMN public.user_profiles.executor_chamber IS 'Camera Executorilor sau Instanță/ONRC';
COMMENT ON COLUMN public.user_profiles.executor_office_address IS 'Sediul biroului executor/lichidator';
COMMENT ON COLUMN public.user_profiles.executor_office_location IS 'Localitate sediu';
COMMENT ON COLUMN public.user_profiles.executor_website IS 'Website (executor/lichidator)';
