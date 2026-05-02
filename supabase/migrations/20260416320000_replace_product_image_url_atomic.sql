-- Înlocuire atomică a unui URL în products.images (evită lost-update când
-- mai multe image_jobs pentru același produs rulează în paralel).

CREATE OR REPLACE FUNCTION public.replace_product_image_url(
  p_product_id uuid,
  p_old text,
  p_new text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_product_id IS NULL OR p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN
    RETURN;
  END IF;

  UPDATE public.products p
  SET
    images = (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(u.nx) ORDER BY u.ord),
        '[]'::jsonb
      )
      FROM (
        SELECT
          t.ord,
          CASE WHEN t.x = p_old THEN p_new ELSE t.x END AS nx
        FROM jsonb_array_elements_text(COALESCE(p.images, '[]'::jsonb))
          WITH ORDINALITY AS t(x, ord)
      ) u
    ),
    updated_at = now()
  WHERE p.id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_image_url(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_image_url(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.replace_product_image_url(uuid, text, text) IS
  'Mirror worker: replace one image URL in products.images in a single row update (concurrency-safe).';
