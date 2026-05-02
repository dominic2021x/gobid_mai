-- Migration: Add Premium Promotion fields to products and user_profiles tables
-- Adds support for premium subscription at user level (all user's products are promoted)

-- Add premium fields to user_profiles table (user-level subscription)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Add premium fields to products table (inherited from user subscription)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- Create index for premium users (for faster queries)
CREATE INDEX IF NOT EXISTS idx_user_profiles_premium 
  ON public.user_profiles (is_premium, premium_until) 
  WHERE is_premium = true;

-- Create index for premium products (for faster queries)
CREATE INDEX IF NOT EXISTS idx_products_premium 
  ON public.products (is_premium, premium_until) 
  WHERE is_premium = true;

-- Create index for active premium products (for homepage sorting)
-- Products are premium if user has premium OR product itself is premium
-- Notă: Verificarea premium_until > NOW() se face la runtime, nu în index (NOW() nu este IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_products_premium_active 
  ON public.products (is_premium, premium_until, created_at DESC) 
  WHERE is_premium = true AND status = 'active';

-- Function to automatically deactivate expired premium promotions
CREATE OR REPLACE FUNCTION public.check_premium_expiration()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.products
  SET is_premium = false
  WHERE is_premium = true 
    AND premium_until IS NOT NULL 
    AND premium_until < NOW();
END;
$$;

-- Optional: Create a scheduled job to run this function daily
-- This would require pg_cron extension
-- SELECT cron.schedule('check-premium-expiration', '0 0 * * *', 'SELECT public.check_premium_expiration();');

COMMENT ON COLUMN public.products.premium_until IS 'Data până la care promovarea premium este activă';
COMMENT ON COLUMN public.products.is_premium IS 'Indică dacă produsul are promovare premium activă';


