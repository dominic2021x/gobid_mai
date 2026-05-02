-- Saved Search Alerts: users can save searches and receive notifications for new listings

CREATE TABLE IF NOT EXISTS public.user_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  q_norm text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user_id
  ON public.user_saved_searches (user_id);

CREATE INDEX IF NOT EXISTS idx_user_saved_searches_q_norm
  ON public.user_saved_searches (q_norm);

ALTER TABLE public.user_saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved searches" ON public.user_saved_searches;
CREATE POLICY "Users manage own saved searches"
  ON public.user_saved_searches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
