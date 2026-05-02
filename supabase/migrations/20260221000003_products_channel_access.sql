-- Phase 1: Channel and token-gating fields for RO listings.
-- Executări & Insolvență = separate channel (token-gated); taxonomy category = item nature (imobiliare/autovehicule/etc.).

-- Add columns (additive, safe)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'ro',
  ADD COLUMN IF NOT EXISTS requires_token BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_scope TEXT NULL;

COMMENT ON COLUMN public.products.channel IS 'Access channel: ro = main marketplace, executari_insolventa = token-gated Executări & Insolvență';
COMMENT ON COLUMN public.products.requires_token IS 'When true, listing is only visible when user has channel access (e.g. executari token)';
COMMENT ON COLUMN public.products.access_scope IS 'Optional scope for future use (e.g. region)';

-- Index for channel filtering
CREATE INDEX IF NOT EXISTS products_channel_idx ON public.products (channel);

-- Backfill: set channel and requires_token from existing product_type/sale_type/category (idempotent)
UPDATE public.products
SET
  channel = 'executari_insolventa',
  requires_token = true
WHERE
  (
    LOWER(COALESCE(product_type, '')) = 'licitatii-publice'
    OR LOWER(COALESCE(sale_type, '')) IN ('licitatii-insolventa', 'licitatie-publica')
    OR LOWER(COALESCE(category, '')) = 'executari'
  )
  AND (channel IS NULL OR channel = 'ro');

-- Ensure rest are ro (idempotent)
UPDATE public.products
SET channel = 'ro', requires_token = false
WHERE channel IS NULL OR (channel <> 'executari_insolventa' AND requires_token = false);
