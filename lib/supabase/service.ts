import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE

  if (!url) throw new Error('Missing SUPABASE URL')
  if (!serviceRole) throw new Error('Missing SUPABASE_SERVICE_ROLE')

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
