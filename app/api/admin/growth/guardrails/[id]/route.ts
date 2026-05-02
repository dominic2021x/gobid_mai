import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.min_value === "number" || body.min_value === null)
    updates.min_value = body.min_value;
  if (typeof body.max_value === "number" || body.max_value === null)
    updates.max_value = body.max_value;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update", code: "BAD_REQUEST" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_guardrails")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ ok: true, guardrail: data });
}
