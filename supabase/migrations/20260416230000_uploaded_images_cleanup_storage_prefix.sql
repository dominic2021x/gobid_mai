-- Restrict cleanup paths to app-generated keys: storage_key LIKE 'uploads/%'

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
      AND ui.storage_key LIKE 'uploads/%'
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

CREATE OR REPLACE FUNCTION public.claim_uploaded_images_for_purge(p_limit int)
RETURNS TABLE (id uuid, storage_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ui.id, ui.storage_key
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NOT NULL
    AND ui.deleted_at < now() - interval '24 hours'
    AND ui.storage_key LIKE 'uploads/%'
  ORDER BY ui.deleted_at ASC
  LIMIT p_limit;
END;
$$;

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
    AND ui.storage_key LIKE 'uploads/%'
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
