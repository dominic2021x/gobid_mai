-- ============================================
-- Suggest ranking index: created via manual script (CONCURRENTLY) in production.
-- See: scripts/db/manual/create_idx_suggest_user_seed_rank.sql
--      docs/search/INDEX_DEPLOYMENT.md
-- This migration is a no-op so Supabase CLI (transactional) succeeds.
-- ============================================
SELECT 1;
