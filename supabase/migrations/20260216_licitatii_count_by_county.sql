-- Număr exact de anunțuri per județ (active, cu location_county setat).
-- Folosit de API pentru statistici corecte, fără limită 1000 rânduri.
CREATE OR REPLACE FUNCTION public.get_licitatii_count_by_county()
RETURNS TABLE(county text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT location_county::text AS county, COUNT(*)::bigint AS count
  FROM licitatii_insolventa_listings
  WHERE deleted_at IS NULL
    AND location_county IS NOT NULL
    AND TRIM(location_county) != ''
  GROUP BY location_county
  ORDER BY count DESC;
$$;

COMMENT ON FUNCTION public.get_licitatii_count_by_county() IS 'Returns (county, count) for active licitatii_insolventa_listings with non-empty location_county. Used by admin listings API for accurate filter counts.';
