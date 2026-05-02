-- Add product_id to licitatii_insolventa_listings to link published listings to products
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_product_id
  ON public.licitatii_insolventa_listings(product_id);

COMMENT ON COLUMN public.licitatii_insolventa_listings.product_id IS 'Produsul creat pe site la Publică pe site; null = nepublicat';
