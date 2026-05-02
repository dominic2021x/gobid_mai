/**
 * POST /api/admin/search/suggestions/cleanup-auto-junk
 * Admin-only. Șterge sugestiile auto (seed_titles) care conțin junk:
 * motor/spec (3996, cmc, hp, etc.) sau descriptive (suv-ul, lux, care).
 * Returnează numărul de rânduri șterse.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("cleanup_auto_suggestions_junk");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  return NextResponse.json({ ok: true, deleted });
}
