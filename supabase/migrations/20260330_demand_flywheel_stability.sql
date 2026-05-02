-- Demand Flywheel stability: feedback eval columns + supply snapshot for inventory growth

-- 0) Deduplication index (idempotent; safe if already in 20260329)
CREATE UNIQUE INDEX IF NOT EXISTS growth_demand_actions_unique_pending
  ON growth_demand_actions (type, q_norm)
  WHERE status = 'pending';

-- 1) Feedback: CTR before/after for eval job
ALTER TABLE growth_demand_feedback
  ADD COLUMN IF NOT EXISTS ctr_before numeric,
  ADD COLUMN IF NOT EXISTS ctr_after numeric,
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz;

-- 2) Supply snapshot: store supply per (q_norm, category, county) per day for inventory_growth
CREATE TABLE IF NOT EXISTS growth_demand_supply_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_norm text NOT NULL,
  category_slug text,
  county_slug text,
  supply int NOT NULL,
  snapshot_date date NOT NULL DEFAULT (current_date),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_demand_supply_snapshot_date
  ON growth_demand_supply_snapshot (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_growth_demand_supply_snapshot_keys
  ON growth_demand_supply_snapshot (q_norm, category_slug, county_slug, snapshot_date);
