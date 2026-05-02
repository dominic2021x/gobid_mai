/**
 * Creates a Supabase client that uses the user's JWT so RLS applies.
 * Use in API routes when you need to act as the authenticated user (e.g. assistant tools).
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client that runs with the user's session (RLS applies).
 * Never pass client-provided tokens; use only the access_token from supabase.auth.getUser(accessToken).
 */
export function createServerUserClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
