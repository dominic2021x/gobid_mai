-- Alert Quality + Delivery Control: dedupe, cooldown, delivery modes

-- 1) Table: saved_search_alerts_sent (prevent duplicate alerts per listing)
CREATE TABLE IF NOT EXISTS public.saved_search_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id uuid NOT NULL REFERENCES public.user_saved_searches(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_search_alerts_sent_unique
  ON public.saved_search_alerts_sent (saved_search_id, listing_id);

CREATE INDEX IF NOT EXISTS idx_saved_search_alerts_sent_listing
  ON public.saved_search_alerts_sent (listing_id);

ALTER TABLE public.saved_search_alerts_sent ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see rows for their own saved searches
DROP POLICY IF EXISTS "Users read own sent alerts" ON public.saved_search_alerts_sent;
CREATE POLICY "Users read own sent alerts"
  ON public.saved_search_alerts_sent
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_saved_searches s
      WHERE s.id = saved_search_alerts_sent.saved_search_id AND s.user_id = auth.uid()
    )
  );

-- Insert/update only via service role (worker). No INSERT/UPDATE for anon/authenticated.
-- RLS blocks all; service_role bypasses.

-- 2) Add columns to user_saved_searches
ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT 'instant'
    CHECK (delivery_mode IN ('instant', 'daily_digest', 'weekly_digest')),
  ADD COLUMN IF NOT EXISTS cooldown_minutes int DEFAULT 60;
