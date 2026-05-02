-- Extend junk cleanup: add imbina + remove track-origin phrases ending with care/imbina
-- (e.g. "Jaguar f-pace care", "Jaguar f-pace imbina" from user track).

DELETE FROM public.search_suggestions
WHERE (
  source = 'seed_titles' AND entity_type = 'auto' AND (
    phrase_norm ~ '\bimbina\b' OR phrase_norm ~ '\bimbin\b'
  )
) OR (
  source IS NULL AND phrase_norm ~ '\s+(care|imbina|imbin)\s*$'
);

CREATE OR REPLACE FUNCTION public.cleanup_auto_suggestions_junk()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted int;
BEGIN
  WITH del AS (
    DELETE FROM public.search_suggestions
    WHERE (
      source = 'seed_titles' AND entity_type = 'auto' AND (
        phrase_norm ~ '\s\d{3,}\s' OR phrase_norm ~ '\s\d{3,}$'
        OR phrase_norm ~ '\s(cm3?|cc|hp|cp|kw)\s' OR phrase_norm ~ '\s(cm3?|cc|hp|cp|kw)$'
        OR phrase_norm ~ '\s(tdi|tsi|dci)\s' OR phrase_norm ~ '\s(tdi|tsi|dci)$'
        OR phrase_norm ~ 'suv-ul' OR phrase_norm ~ '\blux\b' OR phrase_norm ~ '\bluxu\b' OR phrase_norm ~ '\bluxul\b'
        OR phrase_norm ~ '\bcare\b' OR phrase_norm ~ '\bimbina\b' OR phrase_norm ~ '\bimbin\b'
      )
    ) OR (
      source IS NULL AND phrase_norm ~ '\s+(care|imbina|imbin)\s*$'
    )
    RETURNING id
  )
  SELECT count(*)::int INTO deleted FROM del;
  RETURN deleted;
END;
$$;
