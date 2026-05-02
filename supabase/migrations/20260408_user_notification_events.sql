-- Notification click events for feedback (user_search_profiles, CTR tuning)

CREATE TABLE IF NOT EXISTS public.user_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('saved_search_instant', 'digest')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_events_kind_created
  ON public.user_notification_events (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notification_events_user_created
  ON public.user_notification_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
