-- Statistici pentru panoul admin „Curățare imagini” (aceleași predicate ca mark_orphan / claim_purge).

CREATE OR REPLACE FUNCTION public.count_uploaded_images_orphan_soft_delete_candidates()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
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
    );
$$;

CREATE OR REPLACE FUNCTION public.count_uploaded_images_r2_purge_ready()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NOT NULL
    AND ui.deleted_at < now() - interval '24 hours'
    AND ui.storage_key LIKE 'uploads/%';
$$;

COMMENT ON FUNCTION public.count_uploaded_images_orphan_soft_delete_candidates() IS
  'Orfani eligibili pentru marcaj soft-delete (≥24h, fără product_images, fără job activ).';

COMMENT ON FUNCTION public.count_uploaded_images_r2_purge_ready() IS
  'Rânduri marcate pentru ștergere fizică R2 (soft-delete cu ≥24h grace).';

REVOKE ALL ON FUNCTION public.count_uploaded_images_orphan_soft_delete_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_uploaded_images_orphan_soft_delete_candidates() TO service_role;

REVOKE ALL ON FUNCTION public.count_uploaded_images_r2_purge_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_uploaded_images_r2_purge_ready() TO service_role;
