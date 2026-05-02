/**
 * Reset seed-suggestions cursor so the next worker run processes all products from the beginning.
 * Auth: CRON_SECRET or admin.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { resetSeedSuggestionsState } from "@/lib/agents/state";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

function hasCronSecret(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const secret = token ?? req.headers.get("x-cron-secret");
  return !!secret && secret === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!hasCronSecret(req)) await requireAdmin(req);

  const supabase = createAdminClient();
  await resetSeedSuggestionsState(supabase);

  return NextResponse.json({
    ok: true,
    message: "Seed suggestions cursor reset; next worker run will process from the beginning.",
  });
}
