-- Digest send: add columns to saved_search_digest_queue for claim + consume

ALTER TABLE public.saved_search_digest_queue
  ADD COLUMN IF NOT EXISTS delivery_mode text,
  ADD COLUMN IF NOT EXISTS available_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_digest_unconsumed
  ON public.saved_search_digest_queue (delivery_mode, available_at)
  WHERE consumed_at IS NULL;

-- Backfill delivery_mode for existing rows from user_saved_searches
UPDATE public.saved_search_digest_queue q
SET delivery_mode = s.delivery_mode
FROM public.user_saved_searches s
WHERE q.saved_search_id = s.id
  AND q.delivery_mode IS NULL;
