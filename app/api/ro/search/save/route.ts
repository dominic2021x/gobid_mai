import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery, MIN_Q_LENGTH, MAX_Q_LENGTH } from "@/lib/search/v2/normalize";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const MAX_SAVED_PER_USER = 20;

/** POST: Save search. Body: { q: string, filters?: object }. Auth required. */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    q?: string;
    filters?: Record<string, unknown>;
    deliveryMode?: string;
    cooldownMinutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const deliveryMode = parseDeliveryMode(body.deliveryMode);
  const cooldownMinutes = parseCooldownMinutes(body.cooldownMinutes);

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q || q.length < MIN_Q_LENGTH) {
    return NextResponse.json(
      { error: `Query must be at least ${MIN_Q_LENGTH} characters`, code: "INVALID_QUERY" },
      { status: 400 }
    );
  }

  const qNorm = normalizeQuery(q);
  if (qNorm.length < MIN_Q_LENGTH || qNorm.length > MAX_Q_LENGTH) {
    return NextResponse.json(
      { error: "Query invalid after normalization", code: "INVALID_QUERY" },
      { status: 400 }
    );
  }

  const filters = body.filters != null && typeof body.filters === "object" ? body.filters : {};
  const filtersJson = sanitizeFilters(filters);

  const admin = createAdminClient();
  const { count } = await admin
    .from("user_saved_searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_SAVED_PER_USER) {
    return NextResponse.json(
      { error: `Maximum ${MAX_SAVED_PER_USER} saved searches allowed`, code: "LIMIT_REACHED" },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("user_saved_searches")
    .select("id")
    .eq("user_id", user.id)
    .eq("q_norm", qNorm)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const update: Record<string, unknown> = {
      filters_json: filtersJson,
      last_checked_at: new Date().toISOString(),
    };
    if (deliveryMode != null) update.delivery_mode = deliveryMode;
    if (cooldownMinutes != null) update.cooldown_minutes = cooldownMinutes;
    await admin.from("user_saved_searches").update(update).eq("id", existing.id);
    return NextResponse.json({ ok: true, id: existing.id, updated: true });
  }

  const insert: Record<string, unknown> = {
    user_id: user.id,
    q_norm: qNorm,
    filters_json: filtersJson,
  };
  if (deliveryMode != null) insert.delivery_mode = deliveryMode;
  if (cooldownMinutes != null) insert.cooldown_minutes = cooldownMinutes;
  const { data: inserted, error } = await admin
    .from("user_saved_searches")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "INSERT_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id });
}

const DELIVERY_MODES = new Set(["instant", "daily_digest", "weekly_digest"]);

function parseDeliveryMode(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  return DELIVERY_MODES.has(s) ? s : null;
}

function parseCooldownMinutes(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 1440) return null;
  return n;
}

const ALLOWED_FILTER_KEYS = new Set([
  "categorie",
  "subcategorie",
  "subcategory",
  "category_level_3",
  "level3",
  "county",
  "city",
  "location",
  "price_min",
  "price_max",
  "priceMin",
  "priceMax",
  "size",
  "sizes",
  "brand",
  "brands",
  "color",
  "colors",
  "condition",
  "conditions",
  "model",
  "product_type",
  "sale_type",
  "scope",
  "channel",
  "list_category",
  "list_categories",
]);

function sanitizeFilters(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!ALLOWED_FILTER_KEYS.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim());
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
