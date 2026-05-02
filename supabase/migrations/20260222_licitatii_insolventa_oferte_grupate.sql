-- Categoria principală „Oferte grupate”: anunțuri cu mai multe bunuri în același anunț
-- (liste numerotate 1. ..., 2. ..., 3. ... în descriere).
UPDATE public.licitatii_insolventa_listings
SET main_category = 'Oferte grupate'
WHERE main_category IS DISTINCT FROM 'Oferte grupate'
  AND description_html IS NOT NULL
  AND trim(description_html) <> ''
  AND (
    coalesce((SELECT count(*) FROM regexp_matches(description_html, '\d+\.\s+\S', 'g')), 0) >= 2
    OR coalesce((SELECT count(*) FROM regexp_matches(description_html, '[\d.]{3,},\d{2}\s*(?:EURO|RON|lei)', 'gi')), 0) >= 2
  );
