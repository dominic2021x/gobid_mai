import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminUser, requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * POST /api/admin/users/delete
 * Hard-delete: removes the user from Supabase Auth (and CASCADE public rows where configured).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === auth.user.id) {
    return NextResponse.json({ error: "Nu poți șterge propriul cont din admin." }, { status: 400 });
  }

  const { data: targetData, error: getTargetError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getTargetError || !targetData?.user) {
    return NextResponse.json({ error: "Utilizatorul nu a fost găsit." }, { status: 404 });
  }

  const targetIsAdmin = await isAdminUser(targetData.user, supabaseAdmin);
  if (targetIsAdmin) {
    return NextResponse.json({ error: "Nu poți șterge un cont de administrator." }, { status: 403 });
  }

  const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (delError) {
    console.error("[admin/users/delete]", delError);
    return NextResponse.json(
      { error: delError.message || "Ștergerea utilizatorului a eșuat." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
