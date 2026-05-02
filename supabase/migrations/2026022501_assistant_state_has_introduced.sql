-- ============================================
-- First-run onboarding: has_introduced on assistant_state
-- ============================================

ALTER TABLE public.assistant_state
  ADD COLUMN IF NOT EXISTS has_introduced BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assistant_state.has_introduced IS 'True after user has seen the friendly onboarding (capabilities + options). Used to skip long intro on later messages.';
