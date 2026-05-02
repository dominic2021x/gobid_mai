import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Date publice despre licitator (executor), via service role — fără RLS.
 * Fost `/api/executor/public` — segmentul `public` putea intra în conflict cu routing-ul Next.
 * Parametru: `userId` (UUID utilizator / user_profiles.user_id).
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data: executorProfile, error } = await supabaseAdmin
      .from("user_profiles")
      .select(
        "licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ExecutorLicitatorPublic] Error fetching executor profile:", error);
      return NextResponse.json(
        { error: "Cannot fetch executor profile", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ executorProfile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ExecutorLicitatorPublic] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error", details: msg }, { status: 500 });
  }
}
