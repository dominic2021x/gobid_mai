-- Diagnostic pentru panoul admin: de ce nu există „orfani eligibili” sau ce îi blochează.

CREATE OR REPLACE FUNCTION public.uploaded_images_cleanup_diag()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_total bigint;
  active_without_pi bigint;
  active_without_pi_uploads bigint;
  blocked_wrong_prefix bigint;
  blocked_too_new bigint;
  blocked_jobs bigint;
  strict_orphans bigint;
BEGIN
  SELECT COUNT(*) INTO active_total FROM public.uploaded_images ui WHERE ui.deleted_at IS NULL;

  SELECT COUNT(*) INTO active_without_pi
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id);

  SELECT COUNT(*) INTO active_without_pi_uploads
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NULL
    AND ui.storage_key LIKE 'uploads/%'
    AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id);

  blocked_wrong_prefix := GREATEST(active_without_pi - active_without_pi_uploads, 0);

  SELECT COUNT(*) INTO blocked_too_new
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NULL
    AND ui.storage_key LIKE 'uploads/%'
    AND ui.created_at >= now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id);

  SELECT COUNT(*) INTO blocked_jobs
  FROM public.uploaded_images ui
  WHERE ui.deleted_at IS NULL
    AND ui.storage_key LIKE 'uploads/%'
    AND ui.created_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.image_id = ui.id)
    AND EXISTS (
      SELECT 1
      FROM public.image_jobs j
      WHERE j.status IN ('pending', 'processing')
        AND (
          (j.result_public_url IS NOT NULL AND j.result_public_url = ui.public_url)
          OR j.source_url = ui.public_url
          OR (j.storage_key IS NOT NULL AND j.storage_key = ui.storage_key)
        )
    );

  SELECT public.count_uploaded_images_orphan_soft_delete_candidates() INTO strict_orphans;

  RETURN jsonb_build_object(
    'activeTotal', active_total,
    'activeWithoutProductImages', active_without_pi,
    'activeWithoutPiUploadsPrefix', active_without_pi_uploads,
    'blockedWrongStoragePrefix', blocked_wrong_prefix,
    'blockedGraceLessThan24hNoPi', blocked_too_new,
    'blockedPendingOrProcessingJobs', blocked_jobs,
    'orphanEligibleStrict', strict_orphans
  );
END;
$$;

COMMENT ON FUNCTION public.uploaded_images_cleanup_diag() IS
  'Decodare: fără product_images, prefix uploads/, grație 24h, image_jobs — de ce tick nu marchează orfani.';

REVOKE ALL ON FUNCTION public.uploaded_images_cleanup_diag() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uploaded_images_cleanup_diag() TO service_role;
