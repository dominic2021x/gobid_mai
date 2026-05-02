-- Semantic Search Graph Engine (v1)

CREATE EXTENSION IF NOT EXISTS vector;

-- Nodes: kind (category, brand, model, county, etc.), slug, label, aliases, meta, popularity
CREATE TABLE IF NOT EXISTS graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  popularity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind_popularity ON graph_nodes (kind, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_aliases_gin ON graph_nodes USING GIN (aliases);

-- Edges: source -> target with relation type and weight
CREATE TABLE IF NOT EXISTS graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_node_id uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  dst_node_id uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  rel text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(src_node_id, dst_node_id, rel)
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_src ON graph_edges (src_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_dst ON graph_edges (dst_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_rel ON graph_edges (rel);

-- Embeddings: one per node, vector(1536) for text-embedding-3-small
CREATE TABLE IF NOT EXISTS graph_embeddings (
  node_id uuid PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
  embedding vector(1536),
  model text NOT NULL DEFAULT 'text-embedding-3-small',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- IVFFlat with lists=1 allows empty table; increase lists after many rows for better ANN
CREATE INDEX IF NOT EXISTS idx_graph_embeddings_ivfflat ON graph_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);

-- Link recommendations: source_path -> target_path with anchor and score
CREATE TABLE IF NOT EXISTS graph_link_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path text NOT NULL,
  target_path text NOT NULL,
  anchor text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_link_recs_source ON graph_link_recommendations (source_path);
CREATE INDEX IF NOT EXISTS idx_graph_link_recs_status ON graph_link_recommendations (status);

-- Cached query -> best node and intent/geo/category
CREATE TABLE IF NOT EXISTS graph_queries (
  q_norm text PRIMARY KEY,
  best_node_id uuid REFERENCES graph_nodes(id) ON DELETE SET NULL,
  intent text,
  county_slug text,
  category_slug text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION graph_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_graph_nodes_updated ON graph_nodes;
CREATE TRIGGER tr_graph_nodes_updated
  BEFORE UPDATE ON graph_nodes
  FOR EACH ROW EXECUTE FUNCTION graph_set_updated_at();

DROP TRIGGER IF EXISTS tr_graph_edges_updated ON graph_edges;
CREATE TRIGGER tr_graph_edges_updated
  BEFORE UPDATE ON graph_edges
  FOR EACH ROW EXECUTE FUNCTION graph_set_updated_at();

DROP TRIGGER IF EXISTS tr_graph_embeddings_updated ON graph_embeddings;
CREATE TRIGGER tr_graph_embeddings_updated
  BEFORE UPDATE ON graph_embeddings
  FOR EACH ROW EXECUTE FUNCTION graph_set_updated_at();

DROP TRIGGER IF EXISTS tr_graph_link_recs_updated ON graph_link_recommendations;
CREATE TRIGGER tr_graph_link_recs_updated
  BEFORE UPDATE ON graph_link_recommendations
  FOR EACH ROW EXECUTE FUNCTION graph_set_updated_at();

DROP TRIGGER IF EXISTS tr_graph_queries_updated ON graph_queries;
CREATE TRIGGER tr_graph_queries_updated
  BEFORE UPDATE ON graph_queries
  FOR EACH ROW EXECUTE FUNCTION graph_set_updated_at();
