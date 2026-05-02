-- Queue for suggestions when confidence < 1 (admin review / approve).
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  proposed_category text NOT NULL,
  proposed_subcategory text NOT NULL,
  proposed_level3 text,
  proposed_attributes jsonb DEFAULT '{}',
  confidence decimal NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'rules',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS category_suggestions_product_id_idx ON public.category_suggestions (product_id);
CREATE INDEX IF NOT EXISTS category_suggestions_status_idx ON public.category_suggestions (status);

COMMENT ON TABLE public.category_suggestions IS 'Proposed category/subcategory/attributes when engine confidence < 1; admin can approve or reject.';
