/**
 * GET /api/products/unlocked-by-ids?ids=uuid1,uuid2,...
 * Returnează rândurile complete din products pentru ID-urile date.
 * Folosește supabaseAdmin (server-side) ca să nu fie filtrate de RLS –
 * produsele din import admin (licitații publice) au status in_progress sau user_id diferit
 * și altfel nu ar apărea pentru utilizator pe /dashboard/exclusiv.
 * Autentificare: cookie sesiune sau Bearer (getRequestAuthUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Autentificare necesară" }, { status: 401 });
    }

    const idsParam = request.nextUrl.searchParams.get("ids");
    if (!idsParam || typeof idsParam !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid ids query (e.g. ?ids=uuid1,uuid2)" },
        { status: 400 }
      );
    }

    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0) {
      return NextResponse.json([]);
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { error: "Too many ids (max 500)" },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .in("id", ids)
      .neq("status", "deleted")
      .limit(500);

    if (error) {
      console.error("[unlocked-by-ids]", error.message);
      return NextResponse.json(
        { error: "Failed to fetch products" },
        { status: 500 }
      );
    }

    return NextResponse.json(rows ?? []);
  } catch (e) {
    console.error("[unlocked-by-ids]", e);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
