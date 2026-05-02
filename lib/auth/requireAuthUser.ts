import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

/**
 * Route Handler helper: return user or a 401 JSON response (server-validated).
 */
export async function requireAuthUser(
  request: Request
): Promise<{ user: User } | NextResponse> {
  const user = await getRequestAuthUser(request);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user };
}
