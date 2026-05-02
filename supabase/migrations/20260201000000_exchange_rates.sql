-- Migration: Create exchange_rates table for BNR EUR/RON rate caching
-- This table stores the official BNR exchange rate, updated daily via cron

-- Create table if not exists
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rate_date DATE NOT NULL,
  eur_ron NUMERIC(10, 4) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'BNR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure only one row exists (id = 1)
  CONSTRAINT exchange_rates_single_row CHECK (id = 1)
);

-- Create index on rate_date for potential historical queries
CREATE INDEX IF NOT EXISTS idx_exchange_rates_rate_date ON public.exchange_rates (rate_date);

-- Insert default fallback rate if table is empty
INSERT INTO public.exchange_rates (id, rate_date, eur_ron, fetched_at, source, updated_at)
VALUES (1, '2024-01-01', 4.9700, NOW(), 'BNR', NOW())
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access on exchange_rates"
  ON public.exchange_rates
  FOR SELECT
  USING (true);

-- Policy: Only service role can update
CREATE POLICY "Only service role can update exchange_rates"
  ON public.exchange_rates
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.exchange_rates IS 'Cached BNR EUR/RON exchange rate, updated daily';
COMMENT ON COLUMN public.exchange_rates.rate_date IS 'Date of the rate from BNR (YYYY-MM-DD)';
COMMENT ON COLUMN public.exchange_rates.eur_ron IS 'EUR to RON conversion rate';
COMMENT ON COLUMN public.exchange_rates.fetched_at IS 'When the rate was fetched from BNR';
COMMENT ON COLUMN public.exchange_rates.source IS 'Source of the rate (always BNR)';
