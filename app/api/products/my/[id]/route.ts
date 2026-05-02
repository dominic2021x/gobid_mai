/**
 * GET /api/products/my/[id]
 * Returnează rândul `products` pentru utilizatorul autentificat (cookie / Bearer).
 * Folosit la „Editează” în Produsele mele — evită eșec când clientul Supabase nu are JWT valid pentru RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Autentificare necesară" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { id: rawId } = await params;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "ID invalid." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("[products/my/[id]]", error);
      return NextResponse.json({ error: "Produsul nu a fost găsit." }, { status: 404 });
    }
    if (!data) {
      return NextResponse.json({ error: "Produsul nu a fost găsit." }, { status: 404 });
    }

    return NextResponse.json({ product: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Eroare";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
