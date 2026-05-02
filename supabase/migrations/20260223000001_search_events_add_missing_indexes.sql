-- ============================================
-- Fallback: indexuri personale pe search_events (dacă au lipsit la prima aplicare)
-- Migrarea inițială (20260223_search_popularity_events) a fost poate deja aplicată
-- fără aceste indexuri; Supabase nu reexecută migrări, deci le adăugăm aici.
-- Idempotent (IF NOT EXISTS). La fresh installs, 20260223_search_popularity_events
-- creează deja indexurile; acest fișier nu modifică/șterge tabelul.
-- ============================================

CREATE INDEX IF NOT EXISTS search_events_user_qnorm_created_at_idx
  ON public.search_events (user_id, q_norm, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_events_user_created_at_idx
  ON public.search_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
