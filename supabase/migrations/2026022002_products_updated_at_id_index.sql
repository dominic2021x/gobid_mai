-- Cursor pagination for admin recategorizare listings (order by updated_at DESC, id DESC).
CREATE INDEX IF NOT EXISTS idx_products_updated_at_id_desc
  ON public.products (updated_at DESC NULLS LAST, id DESC);
