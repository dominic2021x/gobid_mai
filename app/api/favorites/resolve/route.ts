import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_IDS = 100;

/**
 * POST public: rezolvă ID-uri/slug-uri de produse pentru favorite guest (localStorage),
 * fără autentificare — aceleași reguli ca /api/user/favorites/products, dar fără user.
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration" }, { status: 500 });
    }

    let body: { ids?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawIds = body.ids;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }

    const ids = rawIds
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const admin = supabaseAdmin;

    const uuids = ids.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    );
    const slugs = ids.filter(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    );

    let productsData: Record<string, unknown>[] = [];

    if (uuids.length > 0) {
      const { data, error } = await admin
        .from("products")
        .select("*")
        .in("id", uuids)
        .neq("status", "deleted");

      if (error) {
        console.error("[favorites/resolve] UUID load:", error);
      } else if (data) {
        productsData = [...productsData, ...data];
      }
    }

    if (slugs.length > 0) {
      const { data, error } = await admin
        .from("products")
        .select("*")
        .in("slug", slugs)
        .neq("status", "deleted");

      if (error) {
        console.error("[favorites/resolve] slug load:", error);
      } else if (data) {
        productsData = [...productsData, ...data];
      }
    }

    const uniqueProducts = productsData.filter(
      (product, index, self) =>
        index === self.findIndex((p) => p.id === product.id),
    );

    return NextResponse.json({ products: uniqueProducts });
  } catch (e) {
    console.error("[favorites/resolve]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
