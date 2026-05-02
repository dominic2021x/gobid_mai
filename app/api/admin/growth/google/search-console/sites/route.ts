import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listSearchConsoleSites } from "@/lib/google/apis/searchConsole";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  try {
    const sites = await listSearchConsoleSites();
    return NextResponse.json({ sites });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
