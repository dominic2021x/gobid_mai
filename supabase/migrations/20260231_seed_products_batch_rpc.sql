-- ============================================
-- RPC: batch of products for seed_suggestions job.
-- Cursor: (updated_at, id::text). Excludes gated: requires_token = true OR channel = 'executari_insolventa'.
-- ============================================

CREATE OR REPLACE FUNCTION public.seed_products_batch(
  p_last_updated_at timestamptz DEFAULT '1970-01-01T00:00:00Z',
  p_last_id text DEFAULT '00000000-0000-0000-0000-000000000000',
  p_lim int DEFAULT 500
)
RETURNS TABLE(
  id uuid,
  updated_at timestamptz,
  title text,
  channel text,
  requires_token boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id, p.updated_at, p.title, p.channel, p.requires_token
  FROM public.products p
  WHERE (p.requires_token = false OR p.requires_token IS NULL)
    AND (p.channel IS NULL OR p.channel <> 'executari_insolventa')
    AND (
      (COALESCE(p.updated_at, '1970-01-01'::timestamptz) > p_last_updated_at::timestamptz)
      OR (
        COALESCE(p.updated_at, '1970-01-01'::timestamptz) = p_last_updated_at::timestamptz
        AND p.id::text > p_last_id
      )
    )
  ORDER BY COALESCE(p.updated_at, '1970-01-01'::timestamptz) ASC, p.id::text ASC
  LIMIT p_lim;
$$;

COMMENT ON FUNCTION public.seed_products_batch(timestamptz, text, int) IS
  'Batch of products for openclaw_seed_suggestions: cursor (updated_at, id), excludes requires_token=true and channel=executari_insolventa.';
