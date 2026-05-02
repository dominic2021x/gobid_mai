-- ============================================
-- user_profiles: add city for weather in assistant
-- ============================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN public.user_profiles.city IS 'Orașul utilizatorului, folosit pentru rezumatul vremii în asistent.';
