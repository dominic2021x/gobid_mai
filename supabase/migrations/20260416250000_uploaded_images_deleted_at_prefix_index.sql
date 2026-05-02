-- Composite partial index: deleted_at for rows under app upload prefix (cleanup ordering).

CREATE INDEX IF NOT EXISTS uploaded_images_deleted_at_storage_prefix_idx
  ON public.uploaded_images (deleted_at)
  WHERE storage_key LIKE 'uploads/%';

COMMENT ON INDEX public.uploaded_images_deleted_at_storage_prefix_idx IS
  'Supports claim/mark ordering on deleted_at scoped to uploads/ keys.';
