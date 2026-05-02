-- Add needs_reindex to products for admin-controlled suggestion re-seed priority.
-- When true, seed job will prioritize this listing in the next batch and then clear the flag.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS needs_reindex boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.needs_reindex IS 'When true, suggestion seed batch prioritizes this listing and clears flag after processing.';

CREATE INDEX IF NOT EXISTS idx_products_needs_reindex_true
  ON public.products (updated_at DESC NULLS LAST)
  WHERE needs_reindex = true;
