import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const SETTING_KEYS: Record<string, string> = {
  search_console: "gsc_site_url",
  google_ads: "google_ads_customer_id",
  ga4: "ga4_property_id",
  tag_manager: "gtm_container_id",
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { product: string; selection: string };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  const product = body?.product;
  const selection = typeof body?.selection === "string" ? body.selection.trim() : "";
  const key = product ? SETTING_KEYS[product] : null;

  if (!key) {
    return growthJsonError("Invalid product", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("growth_settings")
    .upsert(
      { key, value: selection || "", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ ok: true, key, value: selection || null });
}
