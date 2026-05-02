/**
 * GET /api/admin/recategorizare/filters
 * Returns canonical RO filter schema (same as /ro). Admin only.
 * Single source: lib/filters/getRoFilterSchema.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getRoFilterSchema } from "@/lib/filters";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

/** Revalidate filter schema at most every 15 minutes; no stale legacy sets. */
export const revalidate = 900;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const schema = getRoFilterSchema();
  return NextResponse.json({
    success: true,
    ...schema,
  });
}
