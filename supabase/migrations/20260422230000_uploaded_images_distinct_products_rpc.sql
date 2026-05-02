-- Numără produse distincte care au cel puțin o uploaded_images activă (via product_images).

CREATE OR REPLACE FUNCTION public.count_distinct_products_with_active_uploaded_images()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT pi.product_id)::bigint
  FROM public.product_images pi
  INNER JOIN public.uploaded_images ui ON ui.id = pi.image_id AND ui.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.count_distinct_products_with_active_uploaded_images() IS
  'Produse cu ≥1 poză activă (join product_images ↔ uploaded_images fără deleted_at).';

REVOKE ALL ON FUNCTION public.count_distinct_products_with_active_uploaded_images() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_distinct_products_with_active_uploaded_images() TO service_role;
