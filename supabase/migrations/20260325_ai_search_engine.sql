-- Marketplace AI Search Engine (v1)

CREATE EXTENSION IF NOT EXISTS vector;

-- 1) Search query cache
CREATE TABLE IF NOT EXISTS search_query_cache (
  key text PRIMARY KEY,
  result jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_query_cache_expires ON search_query_cache (expires_at);

-- 2) Query embeddings for semantic (q_norm -> vector)
CREATE TABLE IF NOT EXISTS search_query_embeddings (
  q_norm text PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_query_embeddings_ivfflat ON search_query_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);

-- 3) Explain logs (debug)
CREATE TABLE IF NOT EXISTS search_explain_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_norm text,
  intent text,
  filters jsonb,
  timing jsonb,
  top_signals jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_explain_logs_created ON search_explain_logs (created_at DESC);

-- 4) Intent rules (pattern -> intent + forced_filters)
CREATE TABLE IF NOT EXISTS search_intent_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  intent text NOT NULL,
  forced_filters jsonb,
  priority int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_search_intent_rules_priority ON search_intent_rules (priority);

-- RPC for semantic similarity (graph_embeddings)
CREATE OR REPLACE FUNCTION match_graph_embeddings(
  query_embedding vector(1536),
  match_count int DEFAULT 20
)
RETURNS TABLE (node_id uuid, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ge.node_id, 1 - (ge.embedding <=> query_embedding) AS similarity
  FROM graph_embeddings ge
  WHERE ge.embedding IS NOT NULL
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
