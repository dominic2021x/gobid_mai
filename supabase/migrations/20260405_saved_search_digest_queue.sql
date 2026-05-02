-- Digest queue for saved search alerts (daily/weekly digest modes)

CREATE TABLE IF NOT EXISTS public.saved_search_digest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id uuid NOT NULL REFERENCES public.user_saved_searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_search_digest_queue_search
  ON public.saved_search_digest_queue (saved_search_id, queued_at);

CREATE INDEX IF NOT EXISTS idx_saved_search_digest_queue_user
  ON public.saved_search_digest_queue (user_id);

ALTER TABLE public.saved_search_digest_queue ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated blocked; service_role bypasses RLS for worker.
