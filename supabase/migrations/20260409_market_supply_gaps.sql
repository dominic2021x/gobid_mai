-- Supply Gap Engine: high-demand / low-supply search opportunities

CREATE TABLE IF NOT EXISTS public.market_supply_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_norm text NOT NULL,
  category_slug text,
  county_slug text,
  search_demand integer NOT NULL DEFAULT 0,
  listing_supply integer NOT NULL DEFAULT 0,
  gap_score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'ignored', 'landing_created')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_supply_gaps_q_norm
  ON public.market_supply_gaps (q_norm);

CREATE INDEX IF NOT EXISTS idx_market_supply_gaps_gap_score
  ON public.market_supply_gaps (gap_score DESC);
