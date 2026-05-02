-- ============================================
-- Search intelligence: precomputed stats and quality tables
-- For unified ranking; filled by offline jobs; avoid heavy runtime joins.
-- ============================================

-- A) search_query_stats: per query_norm + vertical + channel + day
CREATE TABLE IF NOT EXISTS public.search_query_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_norm text NOT NULL,
  vertical text NOT NULL DEFAULT 'default',
  channel text,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  submits int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query_norm, vertical, channel, day)
);

CREATE INDEX IF NOT EXISTS idx_search_query_stats_query_norm
  ON public.search_query_stats (query_norm);
CREATE INDEX IF NOT EXISTS idx_search_query_stats_day
  ON public.search_query_stats (day DESC);
CREATE INDEX IF NOT EXISTS idx_search_query_stats_vertical_channel
  ON public.search_query_stats (vertical, channel);

COMMENT ON TABLE public.search_query_stats IS 'Precomputed query-level metrics for ranking (offline).';

-- B) search_query_listing_stats: per query_norm + listing_id + day (for listing ranking)
CREATE TABLE IF NOT EXISTS public.search_query_listing_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_norm text NOT NULL,
  listing_id uuid NOT NULL,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  position_avg numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query_norm, listing_id, day)
);

CREATE INDEX IF NOT EXISTS idx_search_query_listing_stats_query_norm
  ON public.search_query_listing_stats (query_norm);
CREATE INDEX IF NOT EXISTS idx_search_query_listing_stats_listing_id
  ON public.search_query_listing_stats (listing_id);
CREATE INDEX IF NOT EXISTS idx_search_query_listing_stats_day
  ON public.search_query_listing_stats (day DESC);

COMMENT ON TABLE public.search_query_listing_stats IS 'Per-query per-listing engagement for listing rerank (offline).';

-- C) search_query_suggestion_stats: per query_norm + suggestion_id + day
CREATE TABLE IF NOT EXISTS public.search_query_suggestion_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_norm text NOT NULL,
  suggestion_id uuid NOT NULL,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query_norm, suggestion_id, day)
);

CREATE INDEX IF NOT EXISTS idx_search_query_suggestion_stats_query_norm
  ON public.search_query_suggestion_stats (query_norm);
CREATE INDEX IF NOT EXISTS idx_search_query_suggestion_stats_suggestion_id
  ON public.search_query_suggestion_stats (suggestion_id);
CREATE INDEX IF NOT EXISTS idx_search_query_suggestion_stats_day
  ON public.search_query_suggestion_stats (day DESC);

COMMENT ON TABLE public.search_query_suggestion_stats IS 'Per-query per-suggestion engagement for suggest rerank (offline).';

-- D) listing_quality_signals: precomputed listing quality (title, images, completeness, freshness)
CREATE TABLE IF NOT EXISTS public.listing_quality_signals (
  listing_id uuid PRIMARY KEY,
  title_quality numeric(5,4) NOT NULL DEFAULT 0.5,
  image_count int NOT NULL DEFAULT 0,
  image_quality_proxy numeric(5,4) NOT NULL DEFAULT 0,
  field_completeness numeric(5,4) NOT NULL DEFAULT 0.5,
  freshness numeric(5,4) NOT NULL DEFAULT 0.5,
  spam_penalty numeric(5,4) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_quality_signals_freshness
  ON public.listing_quality_signals (freshness DESC);

COMMENT ON TABLE public.listing_quality_signals IS 'Precomputed listing quality for ranking (offline).';

-- E) seller_quality_signals: precomputed seller trust/completeness
CREATE TABLE IF NOT EXISTS public.seller_quality_signals (
  seller_id text NOT NULL,
  channel text NOT NULL DEFAULT 'ro',
  profile_completeness numeric(5,4) NOT NULL DEFAULT 0.5,
  trust_score numeric(5,4) NOT NULL DEFAULT 0.5,
  response_rate numeric(5,4),
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_seller_quality_signals_trust
  ON public.seller_quality_signals (trust_score DESC);

COMMENT ON TABLE public.seller_quality_signals IS 'Precomputed seller quality for ranking (offline).';

-- F) search_refinement_stats: facet option engagement (e.g. category, county) for refinement ordering
CREATE TABLE IF NOT EXISTS public.search_refinement_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinement_key text NOT NULL,
  refinement_value text NOT NULL,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  selects int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (refinement_key, refinement_value, day)
);

CREATE INDEX IF NOT EXISTS idx_search_refinement_stats_key_value
  ON public.search_refinement_stats (refinement_key, refinement_value);
CREATE INDEX IF NOT EXISTS idx_search_refinement_stats_day
  ON public.search_refinement_stats (day DESC);

COMMENT ON TABLE public.search_refinement_stats IS 'Refinement option engagement for ordering facets (offline).';

-- G) geo_query_stats: per query_norm + county_id/place_id for geo tier tuning
CREATE TABLE IF NOT EXISTS public.geo_query_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_norm text NOT NULL,
  county_id uuid,
  place_id uuid,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_query_stats_query_norm
  ON public.geo_query_stats (query_norm);
CREATE INDEX IF NOT EXISTS idx_geo_query_stats_day
  ON public.geo_query_stats (day DESC);

COMMENT ON TABLE public.geo_query_stats IS 'Geo-tier engagement for tuning (offline).';
