-- Create user_blocks table for blocking users
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(blocker_user_id, blocked_user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_status ON public.user_blocks(blocker_user_id, blocked_user_id, blocked) WHERE blocked = true;

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts on re-run)
DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can insert their own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can update their own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.user_blocks;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.user_blocks;

-- Create policy: Users can view their own blocks
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks
  FOR SELECT
  USING (
    auth.uid() = blocker_user_id OR 
    auth.uid() = blocked_user_id
  );

-- Create policy: Users can insert their own blocks
CREATE POLICY "Users can insert their own blocks"
  ON public.user_blocks
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_user_id);

-- Create policy: Users can update their own blocks
CREATE POLICY "Users can update their own blocks"
  ON public.user_blocks
  FOR UPDATE
  USING (auth.uid() = blocker_user_id)
  WITH CHECK (auth.uid() = blocker_user_id);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_user_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (to avoid conflicts on re-run)
DROP TRIGGER IF EXISTS trigger_update_user_blocks_updated_at ON public.user_blocks;

CREATE TRIGGER trigger_update_user_blocks_updated_at
  BEFORE UPDATE ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_user_blocks_updated_at();
