-- ============================================
-- Licitații publice: categorie obligatorie Executări și Insolvență
-- ============================================
-- Toate produsele care sunt licitații publice (product_type = 'licitatii-publice'
-- sau sale_type IN ('licitatie-publica', 'licitatii-insolventa')) au obligatoriu
-- category = 'executari' și custom_fields.listing_main_category / main_category
-- setate la 'Executări și Insolvență'. În restul categoriilor (autovehicule,
-- imobiliare etc.) apar doar produse live_bid; LP apar doar la Executări.

UPDATE public.products
SET
  category = 'executari',
  custom_fields = COALESCE(custom_fields, '{}'::jsonb)
    || jsonb_build_object(
         'listing_main_category', 'Executări și Insolvență',
         'main_category', 'Executări și Insolvență'
       )
WHERE (
  LOWER(COALESCE(product_type, '')) = 'licitatii-publice'
  OR LOWER(COALESCE(sale_type, '')) IN ('licitatie-publica', 'licitatii-insolventa')
);

COMMENT ON COLUMN public.products.category IS 'Categoria principală. LP au întotdeauna executari; în celelalte categorii sunt doar live_bid.';
