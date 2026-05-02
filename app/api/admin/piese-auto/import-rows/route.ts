/**
 * POST /api/admin/piese-auto/import-rows
 * Importă un lot de rânduri CSV într-o singură cerere (debit mai mare decât import-row).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { invalidateProductDerivedCaches } from "@/lib/server/products/invalidateDerivedCaches";
import {
  importPieseAutoProductsForUser,
  type PieseAutoImportInputRow,
} from "@/lib/piese-auto/import-products-core";
import {
  ADMIN_IMPORT_ROWS_NORMAL,
  ADMIN_IMPORT_ROWS_TURBO,
} from "@/lib/piese-auto/admin-import-limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ROWS_NORMAL = ADMIN_IMPORT_ROWS_NORMAL;
const MAX_ROWS_TURBO = ADMIN_IMPORT_ROWS_TURBO;

type Item = { clientId: string; row: PieseAutoImportInputRow };

type Body = {
  targetUserId?: string;
  forceDuplicate?: boolean;
  /** Implicit true pentru acest endpoint (import masiv). */
  fastImport?: boolean;
  /**
   * Mod turbo admin: lot până la MAX_ROWS_TURBO; fără GPT/re-scrape, dar cu oglinzire R2 sincronă.
   */
  turbo?: boolean;
  items?: Item[];
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  const items = Array.isArray(body?.items) ? body!.items! : [];
  const forceDuplicate = body?.forceDuplicate === true;
  const turbo = body?.turbo === true;
  const maxRows = turbo ? MAX_ROWS_TURBO : MAX_ROWS_NORMAL;
  const fastImport = turbo ? true : body?.fastImport !== false;

  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId este obligatoriu." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "items trebuie să conțină cel puțin un rând." }, { status: 400 });
  }
  if (items.length > maxRows) {
    return NextResponse.json(
      { error: `Maxim ${maxRows} rânduri per cerere${turbo ? " (mod turbo)" : ""}.` },
      { status: 400 }
    );
  }

  const rows: PieseAutoImportInputRow[] = [];
  const clientIds: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item;
    const cid = typeof it?.clientId === "string" ? it.clientId.trim() : "";
    if (!cid) {
      return NextResponse.json(
        { error: `Lipsește clientId la indexul ${i}.` },
        { status: 400 }
      );
    }
    if (!it?.row || typeof it.row !== "object") {
      return NextResponse.json(
        { error: `Lipsește row la clientId ${cid}.` },
        { status: 400 }
      );
    }
    clientIds.push(cid);
    rows.push(it.row);
  }

  let result;
  try {
    result = await importPieseAutoProductsForUser(supabaseAdmin, targetUserId, rows, {
      forceDuplicate,
      fastImport,
      turbo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Importul lotului a eșuat.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const createdIds = result.createdIds;
  type ProdRow = {
    id: string;
    title: string | null;
    slug: string | null;
    status: string | null;
    url: string | null;
  };
  let productsById: Record<string, ProdRow> = {};
  if (createdIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("products")
      .select("id,title,slug,status,url")
      .in("id", createdIds);
    const list = (data ?? []) as ProdRow[];
    productsById = Object.fromEntries(list.map((p) => [p.id, p]));
  }

  const rowResults = clientIds.map((clientId, i) => {
    const pr = result.perRow[i];
    if (!pr) {
      return {
        clientId,
        status: "error" as const,
        error: "Răspuns incomplet de la import.",
      };
    }
    if (pr.status === "created") {
      return {
        clientId,
        status: "created" as const,
        product: productsById[pr.productId] ?? {
          id: pr.productId,
          title: null,
          slug: null,
          status: null,
          url: null,
        },
      };
    }
    if (pr.status === "duplicate") {
      return { clientId, status: "duplicate" as const };
    }
    return { clientId, status: "error" as const, error: pr.error };
  });

  if (result.createdCount > 0) {
    await invalidateProductDerivedCaches("admin-piese-auto-import-rows");
  }

  return NextResponse.json({
    success: true,
    turbo,
    batchMax: maxRows,
    createdCount: result.createdCount,
    skippedDuplicates: result.skippedDuplicates,
    failedCount: result.failedCount,
    message: result.message,
    rowResults,
  });
}
