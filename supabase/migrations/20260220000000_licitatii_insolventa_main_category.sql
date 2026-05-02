-- Categoria principală (una din cele 6) pentru filtre în admin licitații insolvență
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS main_category text;

COMMENT ON COLUMN public.licitatii_insolventa_listings.main_category IS 'Categoria principală: Imobiliare, Executări și Insolvență, Autovehicule, Utilaje & Echipamente, Electronice & Tehnologie, Diverse / Speciale. Populat din category la sync/refresh.';

CREATE INDEX IF NOT EXISTS idx_licitatii_insolventa_main_category
  ON public.licitatii_insolventa_listings(main_category)
  WHERE main_category IS NOT NULL AND main_category <> '';

-- Backfill: set main_category din category (regex simplu pentru cele 6 categorii; orice categorie cu „teren” = Imobiliare)
UPDATE public.licitatii_insolventa_listings
SET main_category = CASE
  WHEN lower(trim(category)) ~ 'imobiliare|apartament|case|teren|terenuri|spatii|hale|cladiri|proprietati' THEN 'Imobiliare'
  WHEN lower(trim(category)) ~ 'executari|executare|insolventa|insolvență|faliment' THEN 'Executări și Insolvență'
  WHEN lower(trim(category)) ~ 'auto|masin|vehicul|camion|motociclet|scuter|remorc|rulot|piese auto' THEN 'Autovehicule'
  WHEN lower(trim(category)) ~ 'utilaj|echipament|tractor|combine|agricol|generator|scule' THEN 'Utilaje & Echipamente'
  WHEN lower(trim(category)) ~ 'electronic|laptop|telefon|tablet|tv|pc|console|jocuri|drone' THEN 'Electronice & Tehnologie'
  ELSE 'Diverse / Speciale'
END
WHERE main_category IS NULL AND category IS NOT NULL AND trim(category) <> '';

-- Uniformizare: dacă a rămas 'Executări' vechi, actualizăm la 'Executări și Insolvență'
UPDATE public.licitatii_insolventa_listings
SET main_category = 'Executări și Insolvență'
WHERE main_category = 'Executări';
