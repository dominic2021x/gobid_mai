-- Critical feed/detail indexes for products queries used by homepage, /ro and product pages.
-- These target the exact slow paths observed in runtime logs:
-- 1) listings ordered by created_at with status/channel filters
-- 2) homepage executari feed (product_type + status + created_at)
-- 3) product detail pages by slug + product_type + status
-- 4) premium homepage block

-- Skip large products index builds and ANALYZE during migration push.
