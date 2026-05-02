-- ============================================
-- Migration: category_overrides – lock products from auto-categorization
-- When locked = true, cron auto-categorize skips the product.
-- ============================================

CREATE TABLE IF NOT EXISTS public.category_overrides (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  locked boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.category_overrides IS 'Manual category overrides: when locked=true, autopilot must not change category/subcategory';
COMMENT ON COLUMN public.category_overrides.locked IS 'If true, auto-categorize cron must skip this product';

CREATE INDEX IF NOT EXISTS category_overrides_locked_idx ON public.category_overrides (locked) WHERE locked = true;
