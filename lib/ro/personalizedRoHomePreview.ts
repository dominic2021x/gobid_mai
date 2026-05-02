import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { AccessContext } from "@/lib/server/access/resolveAccess";
import { getRoListings } from "@/lib/server/products/listingsRepo";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import { serializeListingForClient } from "@/lib/ro/roListingsServerUtils";

const PREVIEW_LIMIT = 10;

function topPreferenceKeys(map: Record<string, number> | undefined, max: number): string[] {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k.trim())
    .filter(Boolean);
}

type UserPrefsShape = {
  category?: Record<string, number>;
  county?: Record<string, number>;
  query?: Record<string, number>;
};

/**
 * Anunțuri „pentru tine” pe /ro (primul rând), din profil (`user_search_profiles`) sau fallback la căutări recente (`search_events`).
 * Nu aplică filtru județ din profil — poate anula tot rezultatul; doar categorii / q.
 */
export async function loadPersonalizedRoHomePreview(access: AccessContext): Promise<Record<string, unknown>[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data: profileRow } = await supabase
    .from("user_search_profiles")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();

  const prefs = (profileRow as { prefs?: UserPrefsShape } | null)?.prefs;

  const catKeys = topPreferenceKeys(prefs?.category, 4);
  const queryKeys = topPreferenceKeys(prefs?.query, 2);

  const base: ProductQuery = {
    channel: "ro",
    from: 0,
    limit: PREVIEW_LIMIT,
    sort: "newest",
  };

  let pq: ProductQuery = { ...base };

  if (catKeys.length > 1) {
    pq = { ...pq, categories: catKeys };
  } else if (catKeys.length === 1) {
    pq = { ...pq, categorie: catKeys[0] };
  }

  if (!pq.categories && !pq.categorie && queryKeys.length > 0) {
    pq = { ...pq, q: queryKeys[0] };
  }

  if (!pq.categories && !pq.categorie && !pq.q) {
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: events } = await supabase
      .from("search_events")
      .select("q_norm")
      .eq("user_id", user.id)
      .eq("type", "submit")
      .gte("created_at", since)
      .not("q_norm", "is", null)
      .order("created_at", { ascending: false })
      .limit(120);

    const counts = new Map<string, number>();
    for (const row of events ?? []) {
      const q = String((row as { q_norm?: string }).q_norm ?? "").trim();
      if (q.length < 2) continue;
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    const topQ = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topQ) return [];
    pq = { ...pq, q: topQ };
  }

  if (!pq.categories && !pq.categorie && !pq.q) return [];

  try {
    const result = await getRoListings(pq, access);
    const rows = (result.items ?? []) as Record<string, unknown>[];
    return rows.map(serializeListingForClient);
  } catch {
    return [];
  }
}
