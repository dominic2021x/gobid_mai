-- =============================================================================
-- Verificare câmpuri produse – rulează în Supabase SQL Editor
-- Copiază și rulează fiecare bloc separat (sau tot fișierul).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lista tuturor coloanelor din tabelul products
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- 2. Verifică dacă coloana user_id există (true = da, false = rulează migrația)
-- -----------------------------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'user_id'
) AS are_user_id;


-- -----------------------------------------------------------------------------
-- 3. Ultimul produs creat – toate coloanele + custom_fields
-- -----------------------------------------------------------------------------
SELECT id, title, description, slug, sku,
       category, subcategory, category_level_3, size,
       brand, color, condition,
       starting_price, starting_price_ron, starting_price_eur, currency,
       product_type, status,
       county, city, address,
       user_id, url, images,
       custom_fields,
       seo, created_at, updated_at
FROM public.products
ORDER BY created_at DESC
LIMIT 1;


-- -----------------------------------------------------------------------------
-- 4. Toate cheile folosite în custom_fields (în toate produsele)
-- -----------------------------------------------------------------------------
SELECT DISTINCT jsonb_object_keys(custom_fields) AS cheie
FROM public.products
WHERE custom_fields IS NOT NULL AND custom_fields != '{}'::jsonb
ORDER BY cheie;


-- -----------------------------------------------------------------------------
-- 5. Verificare produs după ID (înlocuiește UUID-ul cu id-ul real al produsului)
-- -----------------------------------------------------------------------------
-- SELECT id, title, category, subcategory, brand, color, condition, size,
--        county, city, starting_price_ron, starting_price_eur, currency,
--        user_id, custom_fields
-- FROM public.products
-- WHERE id = '00000000-0000-0000-0000-000000000000';


-- -----------------------------------------------------------------------------
-- 6. Rezumat: câte produse au fiecare coloană populată
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*) AS total,
  COUNT(title) AS cu_titlu,
  COUNT(category) AS cu_categorie,
  COUNT(subcategory) AS cu_subcategorie,
  COUNT(brand) AS cu_brand,
  COUNT(color) AS cu_culoare,
  COUNT(condition) AS cu_stare,
  COUNT(size) AS cu_marime,
  COUNT(county) AS cu_judet,
  COUNT(city) AS cu_oras,
  COUNT(user_id) AS cu_user_id,
  COUNT(custom_fields) FILTER (WHERE custom_fields != '{}'::jsonb) AS cu_custom_fields
FROM public.products;


-- -----------------------------------------------------------------------------
-- 7. Exemplu: câmpuri din custom_fields pentru ultimele 10 produse active
-- -----------------------------------------------------------------------------
SELECT id, title, category, subcategory,
       custom_fields->>'model' AS model,
       custom_fields->>'ram' AS ram,
       custom_fields->>'capacitate_stocare' AS capacitate_stocare,
       custom_fields->>'garantie' AS garantie,
       custom_fields->>'capacitate_cilindrica' AS capacitate_cilindrica,
       custom_fields->>'an' AS an,
       custom_fields->>'kilometraj' AS kilometraj
FROM public.products
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 10;
