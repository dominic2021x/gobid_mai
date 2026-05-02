-- Atomic claim for worker + stale recovery

CREATE OR REPLACE FUNCTION public.claim_image_jobs(p_limit int)
RETURNS SETOF public.image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.image_jobs
    WHERE status = 'pending'
      AND (next_run_at IS NULL OR next_run_at <= now())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.image_jobs j
  SET status = 'processing',
      locked_at = now(),
      updated_at = now()
  FROM cte
  WHERE j.id = cte.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_image_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_image_jobs(int) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_stale_image_jobs(p_stale_after interval)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.image_jobs
  SET status = 'pending',
      locked_at = null,
      updated_at = now()
  WHERE status = 'processing'
    AND locked_at IS NOT NULL
    AND locked_at < now() - p_stale_after;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_stale_image_jobs(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_stale_image_jobs(interval) TO service_role;
