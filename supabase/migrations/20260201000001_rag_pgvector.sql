-- ===============================================================
-- RAG cu Supabase pgvector
-- Necesar pentru chat AI cu căutare semantică
-- OpenAI text-embedding-3-small = 1536 dimensiuni
-- ===============================================================

-- 1) Activează extensia vector (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Coloană embedding pe products (dacă lipsește)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- 3) Coloană approval_status pe products (dacă lipsește - folosită în RAG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN approval_status TEXT DEFAULT 'approved';
  END IF;
END $$;

-- 4) Index HNSW pentru căutare vector rapidă (products)
CREATE INDEX IF NOT EXISTS idx_products_embedding
ON public.products
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 5) Tabel pages (dacă nu există) - pentru FAQ, termeni, documentație
CREATE TABLE IF NOT EXISTS public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6) Index HNSW pentru pages
CREATE INDEX IF NOT EXISTS idx_pages_embedding
ON public.pages
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 7) RPC match_products - căutare semantică produse
CREATE OR REPLACE FUNCTION public.match_products(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_category text DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  subcategory text,
  starting_price_ron numeric,
  url text,
  slug text,
  images jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.description,
    p.category,
    p.subcategory,
    p.starting_price_ron,
    p.url,
    p.slug,
    p.images,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.products p
  WHERE p.embedding IS NOT NULL
    AND p.title IS NOT NULL
    AND p.description IS NOT NULL
    AND (p.status = 'active' OR p.approval_status = 'approved')
    AND (filter_category IS NULL OR p.category = filter_category OR p.subcategory = filter_category)
    AND (min_price IS NULL OR p.starting_price_ron >= min_price)
    AND (max_price IS NULL OR p.starting_price_ron <= max_price)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 8) RPC match_pages - căutare semantică pagini
CREATE OR REPLACE FUNCTION public.match_pages(
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  url text,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.content,
    p.url,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.pages p
  WHERE p.embedding IS NOT NULL
    AND p.title IS NOT NULL
    AND p.content IS NOT NULL
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 9) Grant execute pentru RPC (service_role și authenticated)
GRANT EXECUTE ON FUNCTION public.match_products TO service_role;
GRANT EXECUTE ON FUNCTION public.match_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_pages TO service_role;
GRANT EXECUTE ON FUNCTION public.match_pages TO authenticated;
