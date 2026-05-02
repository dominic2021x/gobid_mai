-- Returnează numărul de anunțuri care încă nu au "Data licitatie 2" / "Ora licitatie 2" completate (pentru afișare în admin).
CREATE OR REPLACE FUNCTION get_licitatii_count_missing_data_ora2()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint
  FROM licitatii_insolventa_listings l
  WHERE l.deleted_at IS NULL
    AND l.source_url IS NOT NULL
    AND (
      l.meta_fields IS NULL
      OR l.meta_fields->>'Data licitatie 2' IS NULL
      OR trim(coalesce(l.meta_fields->>'Data licitatie 2', '')) = ''
      OR l.meta_fields->>'Ora licitatie 2' IS NULL
      OR trim(coalesce(l.meta_fields->>'Ora licitatie 2', '')) = ''
    );
$$;

COMMENT ON FUNCTION get_licitatii_count_missing_data_ora2() IS 'Count of listings missing Data licitatie 2 / Ora licitatie 2, for admin UI.';
