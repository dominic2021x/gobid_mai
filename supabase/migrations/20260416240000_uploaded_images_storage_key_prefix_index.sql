-- Partial index for cleanup queries filtering storage_key LIKE 'uploads/%'

CREATE INDEX IF NOT EXISTS uploaded_images_storage_key_uploads_prefix_idx
  ON public.uploaded_images (storage_key)
  WHERE storage_key LIKE 'uploads/%';

COMMENT ON INDEX public.uploaded_images_storage_key_uploads_prefix_idx IS
  'Accelerates mark/claim/finalize paths restricted to app upload prefix.';
