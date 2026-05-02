import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const SETTINGS_KEY = "filters_lab_saved_map";

function sanitizeSavedMap(input: unknown): Record<string, number> {
  let candidate: unknown = input;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "savedMap" in (candidate as Record<string, unknown>)) {
    candidate = (candidate as Record<string, unknown>).savedMap;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    const id = String(key || "").trim();
    if (!id) continue;
    const ts = Number(value || 0);
    out[id] = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
  }
  return out;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const savedMap = sanitizeSavedMap(data?.value);
    return NextResponse.json({ success: true, savedMap });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { savedMap?: unknown };
    const savedMap = sanitizeSavedMap(body.savedMap);

    const { error } = await supabaseAdmin.from("settings").upsert(
      {
        key: SETTINGS_KEY,
        value: savedMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, savedMap });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

