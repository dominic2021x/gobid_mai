-- Migration: Soft-delete support for user accounts
-- Adds flags/timestamps on user_profiles so we can "delete" an account
-- while keeping all data in Supabase, and later reactivate on re-register.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT,
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

-- Helpful indexes (optional but useful for admin/rehydration flows)
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_lower
  ON public.user_profiles (lower(email));

CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted
  ON public.user_profiles (is_deleted, deleted_at);

