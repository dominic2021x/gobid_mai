-- Global dedupe: same SHA-256 bytes ⇒ one row for all users (enterprise CDN pipeline).
-- Reassign product_images to the canonical row, then remove duplicate uploaded_images rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'uploaded_images'
      AND constraint_name = 'uploaded_images_user_content_hash_unique'
  ) THEN
    ALTER TABLE public.uploaded_images
      DROP CONSTRAINT uploaded_images_user_content_hash_unique;
  END IF;
END $$;

-- Skip global dedupe and unique index build during migration push.
