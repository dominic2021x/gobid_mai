-- Cache events table for admin cache management observability
-- Used by Sistemul Cache (/admin/cache) for live logs and invalidation history

CREATE TABLE IF NOT EXISTS cache_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  tag text,
  action text NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cache_events_created_at ON cache_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_events_type ON cache_events (type);
CREATE INDEX IF NOT EXISTS idx_cache_events_tag ON cache_events (tag);

COMMENT ON TABLE cache_events IS 'Admin cache operations log for /admin/cache panel';
