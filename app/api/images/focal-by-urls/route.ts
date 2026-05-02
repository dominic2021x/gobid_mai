import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST { urls: string[] } → { focalByUrl: Record<url, { focal_x, focal_y }> }
 * Public read of focal metadata for our R2 URLs (no secrets).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { urls?: unknown };
    const raw = Array.isArray(body.urls) ? body.urls : [];
    const urls = raw.filter((u): u is string => typeof u === "string" && u.startsWith("http")).slice(0, 200);

    if (!supabaseAdmin || urls.length === 0) {
      return NextResponse.json({ focalByUrl: {} satisfies Record<string, { focal_x: number; focal_y: number }> });
    }

    const { data, error } = await supabaseAdmin
      .from("uploaded_images")
      .select("public_url, focal_x, focal_y")
      .in("public_url", urls)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const focalByUrl: Record<string, { focal_x: number; focal_y: number }> = {};
    for (const row of data ?? []) {
      const u = row.public_url as string;
      const fx = row.focal_x;
      const fy = row.focal_y;
      if (fx != null && fy != null && Number.isFinite(Number(fx)) && Number.isFinite(Number(fy))) {
        focalByUrl[u] = { focal_x: Number(fx), focal_y: Number(fy) };
      }
    }

    return NextResponse.json({ focalByUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
