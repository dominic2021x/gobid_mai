-- Contact form messages - admin review
-- RLS: insert via service role or authenticated RPC; select/update only for admins

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip text,
  user_agent text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON public.contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages(status);

-- RLS: only service role can insert (API uses service role)
-- Admins can select/update via admin role check in app
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Deny all for anon and authenticated by default
CREATE POLICY "contact_messages_no_anon" ON public.contact_messages
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "contact_messages_no_auth_insert" ON public.contact_messages
  FOR INSERT TO authenticated WITH CHECK (false);

-- Service role bypass (used by API route)
-- Note: service_role bypasses RLS by default in Supabase

-- Allow authenticated users with admin role to read/update (if you have admin role)
-- Uncomment and adjust if using custom admin role:
-- CREATE POLICY "contact_messages_admin_select" ON public.contact_messages
--   FOR SELECT TO authenticated
--   USING ((auth.jwt() ->> 'user_role') = 'admin');

COMMENT ON TABLE public.contact_messages IS 'Messages from /contact form; insert via API with service role';
