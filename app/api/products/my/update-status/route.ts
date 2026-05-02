/**
 * POST /api/products/my/update-status
 * Actualizează statusul unui produs al utilizatorului autentificat (doar cookie + getUser).
 * Folosit de „Produsele mele” — evită erori false „nu ești autentificat” când clientul Supabase nu are JWT în memorie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ALLOWED = new Set(["inactive", "active", "reserved", "sold"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      status?: string;
    };

    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Autentificare necesară" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (!productId || !ALLOWED.has(status)) {
      return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { status };
    if (status === "sold") {
      patch.sold_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(patch as Record<string, unknown>)
      .eq("id", productId)
      .eq("user_id", user.id)
      .select("id, status")
      .single();

    if (error) {
      console.error("[products/my/update-status]", error);
      return NextResponse.json({ error: error.message || "Eroare la actualizare." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Produsul nu a fost găsit." }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: data.id, status: data.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Eroare";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
