-- Metadata for R2 presigned image uploads (no binary processing on API).

CREATE TABLE IF NOT EXISTS public.uploaded_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  content_hash text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uploaded_images_user_content_hash_unique UNIQUE (user_id, content_hash)
);

CREATE INDEX IF NOT EXISTS uploaded_images_user_created_idx
  ON public.uploaded_images (user_id, created_at DESC);

COMMENT ON TABLE public.uploaded_images IS
  'Image uploads to R2: public URL, content SHA256, size; keys are unique to prevent overwrite.';
