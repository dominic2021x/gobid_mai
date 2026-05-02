/**
 * POST /api/admin/sync-repes/verify-status
 * Parcurge paginile REPES, compară cu DB și actualizează doar starea (deleted_at).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyRepesStatusOnly } from "@/lib/scraper-repes/sync";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  const envSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get("authorization");
  const useStream = request.headers.get("x-verify-stream") === "1";

  let allowed = false;
  if (envSecret && secret === envSecret) {
    allowed = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { data: { user } } = await supabaseAdmin!.auth.getUser(token);
      if (await isAdminUser(user)) allowed = true;
    } catch {
      // ignore
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let listingIds: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.listingIds) && body.listingIds.length > 0) {
      listingIds = body.listingIds;
    }
  } catch {
    // ignore
  }

  if (useStream) {
    const encoder = new TextEncoder();
    const readStream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        try {
          const result = await verifyRepesStatusOnly({
            onProgress: (p) => {
              send({ type: "progress", ...p });
              const msg = [p.phase, p.message].filter(Boolean).join(" ");
              if (msg) send({ type: "log", msg });
            },
            listingIds,
          });
          send({
            type: "done",
            success: true,
            summary: {
              pagesCrawled: result.pagesCrawled,
              itemsFound: result.itemsFound,
              softDeleted: result.softDeleted,
              reactivated: result.reactivated,
              errors: result.errors,
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send({ type: "done", success: false, error: message });
        } finally {
          controller.close();
        }
      },
    });
    return new NextResponse(readStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const result = await verifyRepesStatusOnly({ listingIds });
    return NextResponse.json({
      success: true,
      summary: {
        pagesCrawled: result.pagesCrawled,
        itemsFound: result.itemsFound,
        softDeleted: result.softDeleted,
        reactivated: result.reactivated,
        errors: result.errors,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[sync-repes verify-status]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
