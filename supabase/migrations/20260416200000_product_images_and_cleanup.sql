-- product_images: many-to-many products ↔ uploaded_images (R2 metadata)
-- uploaded_images.deleted_at: soft-delete before physical purge (cron worker)
--
-- Prerequisite: if 20260416140000_uploaded_images_r2_metadata.sql was not applied yet,
-- create the same table here so ALTER / FKs succeed. Safe to run when table already exists.
-- Requires: public.products, auth.users; for mark_orphan_* also public.image_jobs (20260416180000).

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

ALTER TABLE public.uploaded_images
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS uploaded_images_deleted_at_idx
  ON public.uploaded_images (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.uploaded_images.deleted_at IS
  'Set when orphan + safe to queue; physical delete after grace period (cleanup worker).';

CREATE TABLE IF NOT EXISTS public.product_images (
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.uploaded_images (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, image_id)
);

CREATE INDEX IF NOT EXISTS product_images_image_id_idx ON public.product_images (image_id);

COMMENT ON TABLE public.product_images IS
  'Single source of truth for “image in use”; kept in sync from products.images via trigger.';

-- Keep product_images aligned with products.images JSON (match uploaded_images.public_url).
-- Reference model for cleanup is product_images; JSON is the sync source only.
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

DROP TRIGGER IF EXISTS products_images_sync_product_images ON public.products;
CREATE TRIGGER products_images_sync_product_images
  AFTER INSERT OR UPDATE OF images ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_product_images_from_products_images();

-- Avoid full-table backfills during migration push; large datasets can exceed statement timeout.
CREATE OR REPLACE FUNCTION public.backfill_product_images_batch(p_limit int DEFAULT 50)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int;
BEGIN
  WITH target_products AS (
    SELECT p.id, p.images
    FROM public.products p
    WHERE p.images IS NOT NULL
      AND jsonb_typeof(p.images) = 'array'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      )
    ORDER BY p.id
    LIMIT GREATEST(p_limit, 0)
  )
  INSERT INTO public.product_images (product_id, image_id)
  SELECT tp.id, ui.id
  FROM target_products tp
  JOIN LATERAL jsonb_array_elements_text(tp.images) AS t(url) ON true
  JOIN public.uploaded_images ui
    ON ui.public_url = t.url
   AND ui.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- Intentionally not executed during migration push.
-- Run `SELECT public.backfill_product_images_batch(<limit>);` manually if historical rows need seeding.

-- Phase 1: mark orphans (24h+ old); references = product_images only + active image_jobs.
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

-- Phase 2: candidates for physical purge (soft-deleted 24h+ ago). App deletes R2 then DB row.
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
  ORDER BY ui.deleted_at ASC
  LIMIT p_limit;
END;
$$;

-- After R2 delete: remove row only if still orphan (product_images + jobs re-checked).
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

REVOKE ALL ON FUNCTION public.mark_orphan_uploaded_images_soft_delete(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_uploaded_images_for_purge(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_uploaded_image_purge(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_orphan_uploaded_images_soft_delete(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_uploaded_images_for_purge(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_uploaded_image_purge(uuid) TO service_role;
