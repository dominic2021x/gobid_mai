import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export type AssistantAuth = { userId: string; accessToken: string };

/**
 * Returns the authenticated user for assistant APIs. Use Authorization: Bearer <accessToken>.
 */
export async function getAssistantAuth(request: NextRequest): Promise<AssistantAuth | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user?.id) return null;
  return { userId: data.user.id, accessToken };
}
