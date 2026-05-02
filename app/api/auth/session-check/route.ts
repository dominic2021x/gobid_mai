import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/auth/session-check
 * Validates the current request using Supabase cookies (and optional Bearer), same as other /api routes.
 * Răspuns mereu 200 + `{ authenticated }` — fără 401 pentru „nelogat” (evită zgomot în loguri / DevTools).
 */
export async function GET(request: NextRequest) {
  const user = await getRequestAuthUser(request);
  return NextResponse.json(
    { authenticated: Boolean(user?.id) },
    { status: 200 }
  );
}
