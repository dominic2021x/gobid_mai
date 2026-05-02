-- RO listings performance: composite + partial indexes for keyset (created_at DESC, id DESC) and category+status filters.
-- Run ANALYZE public.products; after deploy so the planner has fresh stats.
--
-- Note: taxonomy slug is stored in public.products.category (not category_slug).

-- Skip large products index builds during migration push.
