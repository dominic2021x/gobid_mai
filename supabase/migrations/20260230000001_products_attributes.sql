-- products.attributes: canonical, queryable attributes (fuel, bodyType, apparelType, etc.)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS attributes jsonb DEFAULT '{}';

COMMENT ON COLUMN public.products.attributes IS 'Canonical attributes from categorization (fuel, bodyType, partType, department, apparelType, footwearType, accessoryType). Used by /api/ro/listings filters.';

CREATE INDEX IF NOT EXISTS idx_products_attributes_gin ON public.products USING gin (attributes);
