-- Create user_reports table for user reports
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  conversation_id TEXT,
  product_title TEXT NOT NULL,
  reported_user_name TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
); 

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at ON public.user_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_product ON public.user_reports(product_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all reports" ON public.user_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.user_reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON public.user_reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.user_reports;

-- Create policy: Admins can view all reports
CREATE POLICY "Admins can view all reports"
  ON public.user_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create policy: Users can view their own reports
CREATE POLICY "Users can view their own reports"
  ON public.user_reports
  FOR SELECT
  USING (auth.uid() = reporter_user_id);

-- Create policy: Users can insert their own reports
CREATE POLICY "Users can insert their own reports"
  ON public.user_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

-- Create policy: Admins can update reports
CREATE POLICY "Admins can update reports"
  ON public.user_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create trigger for updating updated_at
DROP TRIGGER IF EXISTS trigger_update_user_reports_updated_at ON public.user_reports;

CREATE OR REPLACE FUNCTION update_user_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_reports_updated_at
  BEFORE UPDATE ON public.user_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_user_reports_updated_at();
