/**
 * POST /api/admin/executari-publice/regenerate-products
 * Regenerează produse pentru listări REPES (batch).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 120;

async function isAdminUser(user: { id?: string } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let body: { listingIds?: string[]; limit?: number };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const limit = Math.min(500, Math.max(1, body.limit ?? 100));
  let listingIds = body.listingIds;

  if (!listingIds?.length) {
    const { data: rows } = await supabaseAdmin
      .from("repes_listings")
      .select("id")
      .not("product_id", "is", null)
      .limit(limit);
    listingIds = (rows || []).map((r: { id: string }) => r.id);
  }

  if (!listingIds.length) {
    return NextResponse.json({ success: true, regenerated: 0, failed: 0, results: [], message: "Niciun listing cu product_id." });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const token = authHeader.slice(7);
  const results: { productId: string; success: boolean; error?: string; title?: string }[] = [];

  for (const id of listingIds) {
    try {
      const res = await fetch(`${origin}/api/admin/executari-publice/regenerate-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: id }),
      });
      const data = await res.json();
      const listing = await supabaseAdmin.from("repes_listings").select("title").eq("id", id).single();
      const title = (listing.data as { title?: string } | null)?.title;
      if (data.success) {
        results.push({ productId: data.productId ?? id, success: true, title });
      } else {
        results.push({ productId: id, success: false, error: data.error ?? res.statusText, title });
      }
    } catch (e) {
      results.push({ productId: id, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const regenerated = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    regenerated,
    failed,
    results,
    message: `Regenerate: ${regenerated} reușite, ${failed} eșecuri.`,
  });
}
