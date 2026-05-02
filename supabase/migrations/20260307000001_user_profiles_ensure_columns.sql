-- Asigură că user_profiles are toate coloanele necesare pentru setări (profil salvat persistent)
-- Poate fi rulat oricând; ADD COLUMN IF NOT EXISTS este idempotent.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_cui text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text;

-- metadata (jsonb) există din migrarea inițială; username, county etc. se salvează în metadata.
