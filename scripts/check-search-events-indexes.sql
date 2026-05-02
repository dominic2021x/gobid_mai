-- Verificare indexuri pe public.search_events.
-- Rulați în Supabase SQL Editor sau psql ca să verificați că indexurile personale există:
--   search_events_user_qnorm_created_at_idx
--   search_events_user_created_at_idx

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'search_events'
ORDER BY indexname;
