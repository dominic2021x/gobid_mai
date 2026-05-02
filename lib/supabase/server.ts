import { createServerClient as createServerClientSSR } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Request-scoped Supabase client (anon key + user session from cookies).
 * Uses `getAll` / `setAll` — required shape for @supabase/ssr on Next.js 15+ (async cookies()).
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createServerClientSSR(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored when called from Server Component; middleware may handle
        }
      },
    },
  });
}

/** Alias for the single server-side user-scoped client (cookie session). */
export async function getSupabaseServer() {
  return createServerClient();
}
