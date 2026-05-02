/**
 * POST /api/admin/sync-repes/publish-unpublished
 * Publică anunțurile nepublicate (product_id null) din repes_listings, unul câte unul la 5 secunde.
 * Auth: Bearer (admin). Opțional header x-publish-stream: 1 pentru răspuns stream (log live).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const LIMIT = 50;
const DELAY_MS = 5000;

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export const runtime = "nodejs";
export const maxDuration = 600;

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

  const useStream = request.headers.get("x-publish-stream") === "1";
  const origin = request.headers.get("x-forwarded-host")
    ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
    : new URL(request.url).origin;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader!,
  };

  const { data: listings } = await supabaseAdmin
    .from("repes_listings")
    .select("id, title")
    .is("product_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  const items = listings ?? [];
  const ids = items.map((r) => r.id);
  const titleById = new Map(items.map((r) => [r.id, (r.title || "").slice(0, 60)]));

  if (useStream) {
    const encoder = new TextEncoder();
    const readStream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        send({ type: "log", msg: `Găsite ${ids.length} anunțuri nepublicate. Încep publicarea (1 la 5 secunde).` });
        let published = 0;
        let failed = 0;
        for (let i = 0; i < ids.length; i++) {
          const listingId = ids[i];
          const title = titleById.get(listingId) || listingId.slice(0, 8);
          try {
            const res = await fetch(`${origin}/api/admin/executari-publice/publish`, {
              method: "POST",
              headers,
              body: JSON.stringify({ listingId }),
            });
            const data = await res.json().catch(() => ({}));
            const ok = res.ok && data.results?.[0]?.success;
            if (ok) {
              published++;
              send({ type: "log", msg: `Publicat ${i + 1}/${ids.length}: ${title}` });
            } else {
              failed++;
              const err = data.error ?? data.results?.[0]?.error ?? "Eroare";
              send({ type: "log", msg: `Eșec ${i + 1}/${ids.length}: ${title} — ${err}` });
            }
          } catch (e) {
            failed++;
            const err = e instanceof Error ? e.message : String(e);
            send({ type: "log", msg: `Eșec ${i + 1}/${ids.length}: ${title} — ${err}` });
          }
          if (i < ids.length - 1) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }
        send({ type: "done", success: failed === 0, published, failed, total: ids.length });
        controller.close();
      },
    });
    return new NextResponse(readStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let published = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i++) {
    const listingId = ids[i];
    try {
      const res = await fetch(`${origin}/api/admin/executari-publice/publish`, {
        method: "POST",
        headers,
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.results?.[0]?.success) published++;
      else failed++;
    } catch {
      failed++;
    }
    if (i < ids.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return NextResponse.json({
    success: true,
    published,
    failed,
    total: ids.length,
  });
}
