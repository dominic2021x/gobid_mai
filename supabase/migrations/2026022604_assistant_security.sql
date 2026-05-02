-- ============================================
-- ENTERPRISE: rate_limits (sliding window fallback), assistant_audit_log, RLS
-- assistant_events already exists; policies and indexes reinforced
-- ============================================

-- rate_limits: server-only (service role). No RLS; backend writes only.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON public.rate_limits (key, window_start DESC);

COMMENT ON TABLE public.rate_limits IS 'Sliding-window rate limit hits (backend only). TTL cleanup on read.';

-- assistant_audit_log: server-only inserts; optional select own
CREATE TABLE IF NOT EXISTS public.assistant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_log_user_created
  ON public.assistant_audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_log_action
  ON public.assistant_audit_log (action);

ALTER TABLE public.assistant_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own audit log" ON public.assistant_audit_log;
CREATE POLICY "Users select own audit log" ON public.assistant_audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT only via service role (no policy = anon cannot insert; server uses service role and bypasses RLS or we allow service role)
-- With RLS enabled, only SELECT is allowed for users. Insert from backend uses service role which bypasses RLS.
-- So we do not create an INSERT policy for anon; server uses createAdminClient() to insert.

COMMENT ON TABLE public.assistant_audit_log IS 'Audit trail for assistant actions (publish, draft_create, etc.). Insert server-only.';

-- assistant_events: ensure select own rows, insert via server only (already has policies; ensure user_id index)
-- Index already in 2026022602: idx_assistant_events_user_created on (user_id, created_at DESC)
-- RLS: select own (user_id = auth.uid() OR via conversation), insert when conversation belongs to user
-- No change if already applied in 2026022601/2026022602.
