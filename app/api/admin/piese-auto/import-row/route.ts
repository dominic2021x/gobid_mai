/**
 * POST /api/admin/piese-auto/import-row
 * Importă un singur rând CSV pentru dealerul țintă.
 * Folosit de panoul admin pentru progres live + pause/resume/stop/retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { invalidateProductDerivedCaches } from "@/lib/server/products/invalidateDerivedCaches";
import {
  importPieseAutoProductsForUser,
  type PieseAutoImportInputRow,
} from "@/lib/piese-auto/import-products-core";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

type ImportOneBody = {
  targetUserId?: string;
  forceDuplicate?: boolean;
  /** Fără GPT / re-scrape; implicit fără așteptare R2 dacă nu e turbo. */
  fastImport?: boolean;
  /** Oglinzi R2 sincronă (nu lasă URL-uri externe în products.images). */
  turbo?: boolean;
  row?: PieseAutoImportInputRow;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as ImportOneBody | null;
  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  const row = body?.row;
  const forceDuplicate = body?.forceDuplicate === true;
  const turbo = body?.turbo === true;
  const fastImport = body?.fastImport === true || turbo;

  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId este obligatoriu." }, { status: 400 });
  }
  if (!row || typeof row !== "object") {
    return NextResponse.json({ error: "row este obligatoriu." }, { status: 400 });
  }

  let result;
  try {
    result = await importPieseAutoProductsForUser(
      supabaseAdmin,
      targetUserId,
      [row],
      { forceDuplicate, fastImport, turbo }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Importul rândului a eșuat.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const createdId = result.createdIds[0] ?? null;
  let createdProduct: {
    id: string;
    title: string | null;
    slug: string | null;
    status: string | null;
    url: string | null;
  } | null = null;

  if (createdId) {
    const { data } = await supabaseAdmin
      .from("products")
      .select("id,title,slug,status,url")
      .eq("id", createdId)
      .maybeSingle();
    createdProduct = (data as typeof createdProduct) ?? null;
    await invalidateProductDerivedCaches("admin-piese-auto-import-row");
  }

  return NextResponse.json({
    success: true,
    created: createdId ? 1 : 0,
    skipped: result.skippedDuplicates,
    failed: result.failedCount,
    createdId,
    createdProduct,
    firstError: result.failed?.[0]?.error ?? null,
    message: result.message,
  });
}

