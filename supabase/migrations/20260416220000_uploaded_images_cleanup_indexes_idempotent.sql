-- Idempotent indexes for cleanup paths (no-op if already created in 20260416200000).

CREATE INDEX IF NOT EXISTS uploaded_images_deleted_at_idx
  ON public.uploaded_images (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_images_image_id_idx
  ON public.product_images (image_id);
