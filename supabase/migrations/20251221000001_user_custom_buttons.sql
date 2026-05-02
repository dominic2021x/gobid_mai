-- Migration: Create user_custom_buttons table
-- This table stores custom dashboard button configurations for regular users
-- Similar to executor_custom_buttons but for regular users

-- Ensure set_updated_at function exists (might already exist from other migrations)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create user_custom_buttons table
CREATE TABLE IF NOT EXISTS public.user_custom_buttons (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  button_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_custom_buttons_user_id ON public.user_custom_buttons(user_id);

-- Create trigger to update updated_at timestamp (drop first if exists)
DROP TRIGGER IF EXISTS trg_user_custom_buttons_updated_at ON public.user_custom_buttons;
CREATE TRIGGER trg_user_custom_buttons_updated_at
BEFORE UPDATE ON public.user_custom_buttons
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable Row Level Security
ALTER TABLE public.user_custom_buttons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own custom buttons" ON public.user_custom_buttons;
DROP POLICY IF EXISTS "Users can insert their own custom buttons" ON public.user_custom_buttons;
DROP POLICY IF EXISTS "Users can update their own custom buttons" ON public.user_custom_buttons;
DROP POLICY IF EXISTS "Users can delete their own custom buttons" ON public.user_custom_buttons;

-- Policy: Users can view their own custom buttons
CREATE POLICY "Users can view their own custom buttons"
  ON public.user_custom_buttons
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own custom buttons
CREATE POLICY "Users can insert their own custom buttons"
  ON public.user_custom_buttons
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own custom buttons
CREATE POLICY "Users can update their own custom buttons"
  ON public.user_custom_buttons
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own custom buttons
CREATE POLICY "Users can delete their own custom buttons"
  ON public.user_custom_buttons
  FOR DELETE
  USING (auth.uid() = user_id);








































