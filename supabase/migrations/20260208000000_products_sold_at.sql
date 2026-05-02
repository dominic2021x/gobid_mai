-- Add sold_at column to products for 24h live visibility
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

COMMENT ON COLUMN public.products.sold_at IS 'Timestamp when product was marked as sold; product remains visible in listings for 24h after this';
