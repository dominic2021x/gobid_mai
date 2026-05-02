-- Enable Realtime for user_activity_logs table
-- This allows real-time updates for the LIVE users counter in the admin dashboard

-- Add table to Realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'user_activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_logs;
  END IF;
END $$;
