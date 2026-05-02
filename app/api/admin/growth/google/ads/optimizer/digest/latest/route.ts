import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const PRODUCT = "google_ads";
const KIND = "daily_digest";

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_google_snapshots")
    .select("id, scope_ref, result, created_at")
    .eq("product", PRODUCT)
    .eq("kind", KIND)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ digest: data ?? null });
}
