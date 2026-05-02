/**
 * Browser Supabase client — single export via @supabase/ssr createBrowserClient.
 * Do not import @/lib/supabase here (avoid circular dependency with lib/supabase.ts).
 */

import { createBrowserClient } from "@supabase/ssr";

const supabaseCustomFetch: typeof fetch = async (input, init) => {
  const modifiedInit = { ...init };
  if (init?.method === "PATCH" && modifiedInit.headers) {
    const headers = new Headers(modifiedInit.headers);
    if (headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    modifiedInit.headers = headers;
  }
  return fetch(input, modifiedInit);
};

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  /** Mai jos = mai puțin trafic pe wss (Firefox / 429). Poți suprascrie cu NEXT_PUBLIC_SUPABASE_REALTIME_EVENTS_PER_SECOND. */
  const eps = Math.min(
    10,
    Math.max(
      1,
      Number(process.env.NEXT_PUBLIC_SUPABASE_REALTIME_EVENTS_PER_SECOND) || 4
    )
  );
  browserClient = createBrowserClient(url, key, {
    global: { fetch: supabaseCustomFetch },
    realtime: {
      params: { eventsPerSecond: eps },
    },
  });
  return browserClient;
}
