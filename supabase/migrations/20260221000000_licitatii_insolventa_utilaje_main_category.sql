-- Toate anunțurile cu categoria/subcategoria „Masini si utilaje” (sau orice variantă cu „utilaje”)
-- au main_category = „Utilaje & Echipamente”, nu Autovehicule.
UPDATE public.licitatii_insolventa_listings
SET main_category = 'Utilaje & Echipamente'
WHERE main_category IS DISTINCT FROM 'Utilaje & Echipamente'
  AND category IS NOT NULL
  AND trim(category) <> ''
  AND (lower(trim(category)) LIKE '%utilaje%' OR lower(trim(category)) LIKE '%utilaj%');
