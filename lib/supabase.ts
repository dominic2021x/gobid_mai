/**
 * Supabase Client - Database Connection
 * Browser: @supabase/ssr createBrowserClient (cookie-aligned + localStorage fallback).
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

/** PATCH Accept fix + Realtime — see lib/supabase/client.ts */
const supabaseCustomFetch: typeof fetch = async (input, init) => {
  const modifiedInit = { ...init };
  if (init?.method === 'PATCH' && modifiedInit.headers) {
    const headers = new Headers(modifiedInit.headers);
    if (headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    modifiedInit.headers = headers;
  }
  return fetch(input, modifiedInit);
};

export const supabase = getSupabaseBrowser();

// Client Supabase pentru server-side (cu service role key pentru admin operations)
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: supabaseCustomFetch,
      },
    })
  : null;

export default supabase;


