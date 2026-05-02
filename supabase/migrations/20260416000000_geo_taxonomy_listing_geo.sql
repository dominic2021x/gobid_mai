-- ============================================
-- Geo taxonomy + listing_geo for progressive location-aware search
-- Canonical model: counties -> places (with type, hierarchy) -> aliases; listing_geo links listings to places
-- ============================================

-- ---------------------------------------------------------------------------
-- 1) geo_counties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geo_counties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  name_norm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

COMMENT ON TABLE public.geo_counties IS 'Canonical Romanian counties (judete); code = ISO/short (e.g. AB, DJ).';

CREATE INDEX IF NOT EXISTS idx_geo_counties_name_norm ON public.geo_counties (name_norm);
CREATE INDEX IF NOT EXISTS idx_geo_counties_code ON public.geo_counties (code);

-- ---------------------------------------------------------------------------
-- 2) geo_places
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geo_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id uuid NOT NULL REFERENCES public.geo_counties(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_norm text NOT NULL,
  type text NOT NULL CHECK (type IN ('municipality', 'city', 'town', 'commune', 'village')),
  parent_place_id uuid REFERENCES public.geo_places(id) ON DELETE SET NULL,
  lat numeric(10, 7),
  lng numeric(10, 7),
  population_rank int,
  importance_score numeric(6, 4) NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.geo_places IS 'Localities: municipality, city, town, commune, village; hierarchy via parent_place_id.';

CREATE INDEX IF NOT EXISTS idx_geo_places_county_id ON public.geo_places (county_id);
CREATE INDEX IF NOT EXISTS idx_geo_places_name_norm ON public.geo_places (name_norm);
CREATE INDEX IF NOT EXISTS idx_geo_places_type ON public.geo_places (type);
CREATE INDEX IF NOT EXISTS idx_geo_places_parent ON public.geo_places (parent_place_id) WHERE parent_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_geo_places_importance ON public.geo_places (county_id, importance_score DESC);

-- ---------------------------------------------------------------------------
-- 3) geo_place_aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geo_place_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.geo_places(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_norm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, alias_norm)
);

COMMENT ON TABLE public.geo_place_aliases IS 'Alternate names / spellings for places (e.g. Craiova -> Craiova).';

CREATE INDEX IF NOT EXISTS idx_geo_place_aliases_alias_norm ON public.geo_place_aliases (alias_norm);
CREATE INDEX IF NOT EXISTS idx_geo_place_aliases_place_id ON public.geo_place_aliases (place_id);

-- ---------------------------------------------------------------------------
-- 4) listing_geo (links products to geography)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_geo (
  listing_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  county_id uuid REFERENCES public.geo_counties(id) ON DELETE SET NULL,
  place_id uuid REFERENCES public.geo_places(id) ON DELETE SET NULL,
  parent_place_id uuid REFERENCES public.geo_places(id) ON DELETE SET NULL,
  lat numeric(10, 7),
  lng numeric(10, 7),
  geo_quality text NOT NULL DEFAULT 'inferred' CHECK (geo_quality IN ('exact', 'inferred', 'county_only')),
  source text NOT NULL DEFAULT 'product_fields' CHECK (source IN ('product_fields', 'geocode', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id)
);

COMMENT ON TABLE public.listing_geo IS 'Listing-to-geography; one row per listing; used for geo ranking and progressive expansion.';

CREATE INDEX IF NOT EXISTS idx_listing_geo_county_id ON public.listing_geo (county_id);
CREATE INDEX IF NOT EXISTS idx_listing_geo_place_id ON public.listing_geo (place_id);
CREATE INDEX IF NOT EXISTS idx_listing_geo_parent_place_id ON public.listing_geo (parent_place_id) WHERE parent_place_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) geo_neighbors (optional: place -> nearby places for expansion)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geo_neighbors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.geo_places(id) ON DELETE CASCADE,
  neighbor_place_id uuid NOT NULL REFERENCES public.geo_places(id) ON DELETE CASCADE,
  distance_km numeric(8, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, neighbor_place_id),
  CHECK (place_id <> neighbor_place_id)
);

COMMENT ON TABLE public.geo_neighbors IS 'Precomputed nearby places for progressive expansion (e.g. Craiova -> nearby towns).';

CREATE INDEX IF NOT EXISTS idx_geo_neighbors_place_id ON public.geo_neighbors (place_id);
CREATE INDEX IF NOT EXISTS idx_geo_neighbors_distance ON public.geo_neighbors (place_id, distance_km);
