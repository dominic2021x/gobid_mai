-- Migration: Allow public read access to user_profiles
-- This allows unauthenticated users to view user profiles (name, avatar) on public pages

-- Enable RLS if not already enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Public can view user profiles" ON public.user_profiles;

-- Create policy to allow public read access to user_profiles
-- This allows anyone (including unauthenticated users) to read basic profile information
CREATE POLICY "Public can view user profiles"
  ON public.user_profiles
  FOR SELECT
  USING (true);

-- Note: The existing "Users manage own profile" policy still applies for UPDATE/INSERT/DELETE
-- This new policy only adds public SELECT access



