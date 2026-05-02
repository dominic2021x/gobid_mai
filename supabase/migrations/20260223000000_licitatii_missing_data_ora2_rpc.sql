-- RPC: returnează id-urile anunțurilor care nu au "Data licitatie 2" și "Ora licitatie 2" completate în meta_fields.
-- Folosit de sync-all-data-ora-2 când onlyMissing = true, ca să nu se reproceseze anunțurile deja completate.
CREATE OR REPLACE FUNCTION get_licitatii_ids_missing_data_ora2(p_limit int DEFAULT 1000)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT l.id
  FROM licitatii_insolventa_listings l
  WHERE l.deleted_at IS NULL
    AND l.source_url IS NOT NULL
    AND (
      l.meta_fields IS NULL
      OR l.meta_fields->>'Data licitatie 2' IS NULL
      OR trim(coalesce(l.meta_fields->>'Data licitatie 2', '')) = ''
      OR l.meta_fields->>'Ora licitatie 2' IS NULL
      OR trim(coalesce(l.meta_fields->>'Ora licitatie 2', '')) = ''
    )
  ORDER BY l.updated_at ASC NULLS LAST
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_licitatii_ids_missing_data_ora2(int) IS 'Ids of licitatii_insolventa_listings missing Data licitatie 2 / Ora licitatie 2 in meta_fields, for bulk sync.';
