-- Resetează complet produsul "apple-iphone-16-alb"

-- 1. Actualizează statusul produsului la 'active'
UPDATE products 
SET status = 'active'
WHERE slug = 'apple-iphone-16-alb';

-- 2. ȘTERGE TOATE ofertele pentru acest produs (resetare completă)
DELETE FROM bids 
WHERE product_id = (SELECT id FROM products WHERE slug = 'apple-iphone-16-alb');

-- SAU (alternativ) - doar marchează ofertele ca outbid
-- UPDATE bids 
-- SET is_winning = false, is_outbid = true
-- WHERE product_id = (SELECT id FROM products WHERE slug = 'apple-iphone-16-alb');

-- Verificare: afișează statusul curent
SELECT 
  p.id, 
  p.slug, 
  p.status, 
  p.product_type,
  COUNT(b.id) as total_bids
FROM products p
LEFT JOIN bids b ON b.product_id = p.id
WHERE p.slug = 'apple-iphone-16-alb'
GROUP BY p.id, p.slug, p.status, p.product_type;
