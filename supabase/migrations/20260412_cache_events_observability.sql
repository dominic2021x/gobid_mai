-- Upgrade cache_events for observability: type, target, status, duration_ms

ALTER TABLE cache_events
  ADD COLUMN IF NOT EXISTS target text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE cache_events DROP COLUMN IF EXISTS tag;
ALTER TABLE cache_events DROP COLUMN IF EXISTS action;
ALTER TABLE cache_events DROP COLUMN IF EXISTS meta;

CREATE INDEX IF NOT EXISTS idx_cache_events_type ON cache_events (type);
CREATE INDEX IF NOT EXISTS idx_cache_events_created_at ON cache_events (created_at DESC);

COMMENT ON TABLE cache_events IS 'Cache admin operations observability: clear_cache, revalidate_path, revalidate_tag, warmup';
