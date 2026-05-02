-- Enterprise cache_events: meta column and composite indexes

ALTER TABLE cache_events
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP INDEX IF EXISTS idx_cache_events_type;
DROP INDEX IF EXISTS idx_cache_events_created_at;

CREATE INDEX IF NOT EXISTS idx_cache_events_created_at ON cache_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_events_type_created_at ON cache_events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_events_target_created_at ON cache_events (target, created_at DESC);
