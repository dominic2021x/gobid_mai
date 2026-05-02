-- Categorii pentru anunțuri REPES (setate în admin, folosite la publicare și filtre).
-- Cat. principală: Imobiliare, Oferte grupate, Utilaje & Echipamente, etc.
-- category: subcategorie (ex. Spatii comerciale, Apartamente si case) – pentru Imobiliare.

ALTER TABLE public.repes_listings ADD COLUMN IF NOT EXISTS main_category text;
ALTER TABLE public.repes_listings ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.repes_listings.main_category IS 'Cat. principală: Imobiliare, Oferte grupate, Utilaje & Echipamente, Autovehicule, Industrial, Afaceri, Office, Altele. Setat în admin.';
COMMENT ON COLUMN public.repes_listings.category IS 'Subcategorie (ex. Spatii comerciale, Apartamente si case). Setat în admin; folosit la publicare și filtre.';

CREATE INDEX IF NOT EXISTS idx_repes_listings_main_category ON public.repes_listings(main_category) WHERE main_category IS NOT NULL AND main_category <> '';
CREATE INDEX IF NOT EXISTS idx_repes_listings_category ON public.repes_listings(category) WHERE category IS NOT NULL AND category <> '';
