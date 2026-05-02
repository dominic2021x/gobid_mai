-- Aprobare support: import CSV admin pentru dealeri piese auto (cont validat înainte de import în numele userului)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS piese_auto_csv_import_approved boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.piese_auto_csv_import_approved IS
  'Dacă true, support poate importa CSV în numele acestui user din panoul admin (piese auto).';
