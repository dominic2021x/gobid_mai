-- Search health samples for periodic health snapshot (latency, cache hit ratio, candidate counts)

CREATE TABLE IF NOT EXISTS search_health_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_hit boolean NOT NULL,
  latency_ms int NOT NULL,
  candidate_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_health_samples_created ON search_health_samples (created_at DESC);
