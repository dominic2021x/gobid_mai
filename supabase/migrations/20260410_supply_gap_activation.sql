-- Supply Gap Activation Engine: quality gate + seller activation

-- 1) Add quality and action columns to market_supply_gaps
ALTER TABLE public.market_supply_gaps
  ADD COLUMN IF NOT EXISTS quality_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS action_state text NOT NULL DEFAULT 'new' CHECK (action_state IN ('new', 'activated', 'ignored'));

-- 2) Create market_supply_gap_actions
CREATE TABLE IF NOT EXISTS public.market_supply_gap_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id uuid NOT NULL REFERENCES public.market_supply_gaps(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('suggest_listing', 'notify_sellers', 'create_lp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_supply_gap_actions_gap_id
  ON public.market_supply_gap_actions (gap_id);

CREATE INDEX IF NOT EXISTS idx_market_supply_gap_actions_type_status
  ON public.market_supply_gap_actions (type, status);
