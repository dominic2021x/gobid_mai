-- Normalize Imobiliare terenuri: move terenuri-intravilane, terenuri-extravilane, terenuri-agricole
-- from subcategory to category_level_3 and set subcategory = 'terenuri'.
-- Optional: run after taxonomy change so listings filter by subcategory=terenuri (and level3) works.
-- Backward compat: listings already match both old (subcategory in 3 slugs) and new (subcategory=terenuri).

UPDATE products
SET
  subcategory = 'terenuri',
  category_level_3 = subcategory,
  updated_at = COALESCE(updated_at, NOW())
WHERE
  LOWER(TRIM(subcategory)) IN ('terenuri-intravilane', 'terenuri-extravilane', 'terenuri-agricole');
