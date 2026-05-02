import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/adminAuth";

/** Server Component / Server Action: true if the current request has an admin session (cookies). */
export async function isAdminFromRequest(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return false;
  return isAdminUser(session.user, supabaseAdmin);
}
