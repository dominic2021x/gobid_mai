-- ============================================
-- Migration: Update product URLs from /auctions/ to /licitatii-publice/
-- ============================================
-- Produsele create anterior au url = '/auctions/slug'. Actualizează la '/licitatii-publice/slug'.

UPDATE public.products
SET url = REPLACE(url, '/auctions/', '/licitatii-publice/')
WHERE url IS NOT NULL AND url LIKE '/auctions/%';
