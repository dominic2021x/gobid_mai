import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";
import { GOOGLE_PRODUCTS, type GoogleProduct } from "@/lib/google/scopes";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const SETTING_KEYS: Record<GoogleProduct, string> = {
  search_console: "gsc_site_url",
  google_ads: "google_ads_customer_id",
  ga4: "ga4_property_id",
  tag_manager: "gtm_container_id",
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();

  const { data: rows, error: intErr } = await supabase
    .from("growth_integrations")
    .select("provider, product, scopes, meta, updated_at")
    .eq("provider", "google");

  if (intErr) return growthJsonError(intErr.message, "INTERNAL_ERROR", 500);

  const products: Record<string, { connected: boolean; scopes: string[]; updated_at: string | null }> = {};
  for (const p of GOOGLE_PRODUCTS) {
    products[p] = { connected: false, scopes: [], updated_at: null };
  }
  for (const r of rows ?? []) {
    const product = r.product as string;
    if (product && products[product]) {
      products[product] = {
        connected: true,
        scopes: Array.isArray(r.scopes) ? r.scopes : [],
        updated_at: r.updated_at ?? null,
      };
    }
  }

  const keys = GOOGLE_PRODUCTS.map((p) => SETTING_KEYS[p]);
  const { data: settingsRows, error: setErr } = await supabase
    .from("growth_settings")
    .select("key, value")
    .in("key", keys);

  if (setErr) return growthJsonError(setErr.message, "INTERNAL_ERROR", 500);

  const selections: Record<string, string> = {
    gsc_site_url: "",
    google_ads_customer_id: "",
    ga4_property_id: "",
    gtm_container_id: "",
  };
  for (const r of settingsRows ?? []) {
    const v = r.value;
    if (v == null) selections[r.key] = "";
    else if (typeof v === "string") selections[r.key] = v;
    else selections[r.key] = String(v);
  }

  return NextResponse.json({
    provider: "google",
    products,
    selections,
  });
}
