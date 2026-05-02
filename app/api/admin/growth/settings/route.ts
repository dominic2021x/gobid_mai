import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("growth_settings").select("key, value, updated_at");

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  const map: Record<string, { value: unknown; updated_at: string }> = {};
  for (const row of data ?? []) {
    map[row.key] = { value: row.value, updated_at: row.updated_at };
  }
  return NextResponse.json({ settings: map });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { key: string; value: unknown };
  try {
    body = await req.json();
  } catch {
    return growthJsonError("Invalid JSON body", "BAD_REQUEST", 400);
  }

  if (!body?.key || typeof body.key !== "string") {
    return growthJsonError("Missing key", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("growth_settings")
    .upsert({ key: body.key, value: body.value ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  return NextResponse.json({ ok: true });
}
