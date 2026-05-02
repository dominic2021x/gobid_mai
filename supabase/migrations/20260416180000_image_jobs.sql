-- Async image mirror jobs: fetch → validate → R2 → patch products.images

CREATE TABLE IF NOT EXISTS public.image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  content_hash text,
  result_public_url text,
  storage_key text,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  product_id uuid REFERENCES public.products (id) ON DELETE CASCADE,
  replace_source_url text NOT NULL,
  next_run_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS image_jobs_status_created_idx
  ON public.image_jobs (status, created_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS image_jobs_product_idx ON public.image_jobs (product_id);

COMMENT ON TABLE public.image_jobs IS
  'Background mirror: HTTP(S) image → R2; worker replaces replace_source_url in products.images.';
