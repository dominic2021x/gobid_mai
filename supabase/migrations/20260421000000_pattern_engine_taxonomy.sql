-- ============================================
-- Pattern engine: taxonomy terms, brand/models, rules, blacklist, whitelist
-- For universal marketplace autocomplete and suggestion quality.
-- ============================================

-- A) search_taxonomy_terms: categories, subcategories, attribute keys (optional seed)
CREATE TABLE IF NOT EXISTS public.search_taxonomy_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_type text NOT NULL CHECK (term_type IN ('category', 'subcategory', 'attribute_key')),
  slug text NOT NULL,
  parent_slug text,
  label_ro text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_type, slug, parent_slug)
);

CREATE INDEX IF NOT EXISTS idx_search_taxonomy_terms_type_slug
  ON public.search_taxonomy_terms (term_type, slug);
CREATE INDEX IF NOT EXISTS idx_search_taxonomy_terms_parent
  ON public.search_taxonomy_terms (parent_slug) WHERE parent_slug IS NOT NULL;

COMMENT ON TABLE public.search_taxonomy_terms IS 'Taxonomy terms for pattern engine (categories, subcategories, attributes).';

-- B) search_brand_models: brands and models (e.g. auto, electronics)
CREATE TABLE IF NOT EXISTS public.search_brand_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL,
  model_slug text,
  vertical text NOT NULL DEFAULT 'auto',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_slug, model_slug, vertical)
);

CREATE INDEX IF NOT EXISTS idx_search_brand_models_brand
  ON public.search_brand_models (brand_slug);
CREATE INDEX IF NOT EXISTS idx_search_brand_models_vertical
  ON public.search_brand_models (vertical);

COMMENT ON TABLE public.search_brand_models IS 'Brands and models for pattern extraction (auto, electronics, etc.).';

-- C) search_pattern_rules: optional override rules (e.g. invalid combinations per vertical)
CREATE TABLE IF NOT EXISTS public.search_pattern_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL CHECK (rule_type IN ('invalid_token', 'weak_last', 'preferred_pattern')),
  vertical text NOT NULL DEFAULT 'universal',
  value text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_type, vertical, value)
);

CREATE INDEX IF NOT EXISTS idx_search_pattern_rules_vertical
  ON public.search_pattern_rules (vertical);

COMMENT ON TABLE public.search_pattern_rules IS 'Pattern rules per vertical (invalid tokens, weak last, preferred).';

-- D) search_pattern_whitelist: phrases always accepted (bypass quality filter)
CREATE TABLE IF NOT EXISTS public.search_pattern_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_norm text NOT NULL UNIQUE,
  vertical text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_pattern_whitelist_phrase_norm
  ON public.search_pattern_whitelist (phrase_norm);

COMMENT ON TABLE public.search_pattern_whitelist IS 'Phrases that bypass pattern quality filter (always show).';

-- E) search_suggestions_blacklist: phrases never shown in suggest
CREATE TABLE IF NOT EXISTS public.search_suggestions_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_norm text NOT NULL UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_suggestions_blacklist_phrase_norm
  ON public.search_suggestions_blacklist (phrase_norm);

COMMENT ON TABLE public.search_suggestions_blacklist IS 'Blacklisted suggestion phrases (never show in autocomplete).';
