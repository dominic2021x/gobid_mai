-- Hardening: product_images-only reference checks, optimized sync trigger,
-- safe DB delete after R2, lookup indexes.

-- Lookup: content_hash alone (UNIQUE (user_id, content_hash) already exists; this helps global hash scans).
CREATE INDEX IF NOT EXISTS uploaded_images_content_hash_idx
  ON public.uploaded_images (content_hash);

-- storage_key is already indexed via UNIQUE(storage_key); no extra btree needed.

COMMENT ON INDEX public.uploaded_images_content_hash_idx IS
  'Cleanup / dedup lookups by hash without user_id.';

-- Sync: skip work when UPDATE did not change images; INSERT always runs.
CREATE OR REPLACE FUNCTION public.sync_product_images_from_products_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.images IS NOT DISTINCT FROM NEW.images THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.product_images WHERE product_id = NEW.id;

  IF NEW.images IS NULL OR jsonb_typeof(NEW.images) != 'array' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_images (product_id, image_id)
  SELECT DISTINCT NEW.id, ui.id
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(NEW.images) AS t(url)
      WHERE t.url = ui.public_url
    );

  RETURN NEW;
END;
$$;

-- Phase 1: orphans use only product_images + active image_jobs (not products.images JSON).
CREATE OR REPLACE FUNCTION public.mark_orphan_uploaded_images_soft_delete(p_limit int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH candidates AS (
    SELECT ui.id
    FROM public.uploaded_images ui
    WHERE ui.deleted_at IS NULL
      AND ui.created_at < now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.image_jobs j
        WHERE j.status IN ('pending', 'processing')
          AND (
            (j.result_public_url IS NOT NULL AND j.result_public_url = ui.public_url)
            OR j.source_url = ui.public_url
            OR (j.storage_key IS NOT NULL AND j.storage_key = ui.storage_key)
          )
      )
    ORDER BY ui.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.uploaded_images ui
  SET deleted_at = now(),
      updated_at = now()
  FROM candidates c
  WHERE ui.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Called after successful R2 delete: removes row only if still unreferenced (race-safe).
CREATE OR REPLACE FUNCTION public.finalize_uploaded_image_purge(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  DELETE FROM public.uploaded_images ui
  WHERE ui.id = p_id
    AND ui.deleted_at IS NOT NULL
    AND ui.deleted_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.image_jobs j
      WHERE j.status IN ('pending', 'processing')
        AND (
          (j.result_public_url IS NOT NULL AND j.result_public_url = ui.public_url)
          OR j.source_url = ui.public_url
          OR (j.storage_key IS NOT NULL AND j.storage_key = ui.storage_key)
        )
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_uploaded_image_purge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_uploaded_image_purge(uuid) TO service_role;
