/**
 * GET /api/admin/recategorizare/listings
 * Same filter params as /ro + titleSearch, titleSearchMode, cursor, pageSize.
 * Admin only; no channel gating. Cursor pagination (updated_at DESC, id DESC).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { buildQueryFromParams } from "@/lib/listings/filters";
import { getAdminRecategorizareListings } from "@/lib/server/admin-recategorizare/listingsRepo";
import { prisma } from "@/lib/server/db";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const RECAT_BATCH_SIZE = 30;

/** Ultima dată de recategorizare per product_id din admin_recategorization_audit. Folosește loturi ca request-ul (Supabase) să nu depășească limita URL. */
async function getLastRecategorizedAt(productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  const audit = prisma?.admin_recategorization_audit;
  if (audit) {
    try {
      const map: Record<string, string> = {};
      for (let i = 0; i < productIds.length; i += RECAT_BATCH_SIZE) {
        const chunk = productIds.slice(i, i + RECAT_BATCH_SIZE);
        const rows = await audit.findMany({
          where: { product_id: { in: chunk, not: null } },
          select: { product_id: true, created_at: true },
          orderBy: { created_at: "desc" },
        });
        for (const row of rows) {
          const pid = row.product_id;
          if (pid && !(pid in map) && row.created_at) map[pid] = row.created_at.toISOString();
        }
      }
      return map;
    } catch {
      // fall through to Supabase
    }
  }
  if (!supabaseAdmin) return {};
  const map: Record<string, string> = {};
  for (let i = 0; i < productIds.length; i += RECAT_BATCH_SIZE) {
    const chunk = productIds.slice(i, i + RECAT_BATCH_SIZE);
    const { data: rows } = await supabaseAdmin
      .from("admin_recategorization_audit")
      .select("product_id, created_at")
      .in("product_id", chunk)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false });
    for (const row of rows ?? []) {
      const pid = row.product_id as string;
      if (pid && !(pid in map) && row.created_at) map[pid] = row.created_at as string;
    }
  }
  return map;
}

/** Lista de product_id care au cel puțin o înregistrare în audit (folosit pentru filtrare „Doar neactualizate”). */
async function getRecategorizedProductIds(): Promise<string[]> {
  const audit = prisma?.admin_recategorization_audit;
  if (audit) {
    try {
      const rows = await audit.findMany({
        where: { product_id: { not: null } },
        select: { product_id: true },
        distinct: ["product_id"],
      });
      return rows.map((r) => r.product_id).filter((id): id is string => id != null);
    } catch {
      // fall through to Supabase
    }
  }
  if (!supabaseAdmin) return [];
  const ids = new Set<string>();
  let from = 0;
  const pageSize = 2000;
  while (true) {
    const { data: rows } = await supabaseAdmin
      .from("admin_recategorization_audit")
      .select("product_id")
      .not("product_id", "is", null)
      .range(from, from + pageSize - 1)
      .order("id", { ascending: true });
    if (!rows?.length) break;
    for (const row of rows) {
      const pid = row.product_id as string;
      if (pid) ids.add(pid);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
    if (ids.size >= 100000) break;
  }
  return Array.from(ids);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const { query } = buildQueryFromParams(searchParams);

  const titleSearch = searchParams.get("titleSearch")?.trim() || undefined;
  const titleSearchMode = (searchParams.get("titleSearchMode") ?? "and") as "and" | "or" | "exact";
  const pageParam = searchParams.get("page");
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : undefined;
  const cursor = page == null ? (searchParams.get("cursor")?.trim() || undefined) : undefined;
  const pageSizeRaw = searchParams.get("pageSize");
  const ALLOWED_PAGE_SIZES = [50, 100, 250, 500, 1000] as const;
  const MAX_PAGE_SIZE_ALL = 5000;
  let pageSize = 50;
  if (pageSizeRaw?.toLowerCase() === "all") {
    pageSize = MAX_PAGE_SIZE_ALL;
  } else if (pageSizeRaw) {
    const n = parseInt(pageSizeRaw, 10);
    pageSize = ALLOWED_PAGE_SIZES.includes(n as (typeof ALLOWED_PAGE_SIZES)[number])
      ? n
      : 50;
  }

  const includeCount = searchParams.get("count") === "1" || searchParams.get("count") === "true";
  const onlyNeverRecategorized = searchParams.get("neverRecategorized") === "1" || searchParams.get("neverRecategorized") === "true";

  let excludeProductIds: string[] | undefined;
  if (onlyNeverRecategorized) {
    excludeProductIds = await getRecategorizedProductIds();
  }

  const adminQuery = {
    ...query,
    titleSearch,
    titleSearchMode: titleSearch ? titleSearchMode : undefined,
    ...(page != null ? { page } : { cursor }),
    pageSize,
    ...(includeCount ? { includeCount: true } : {}),
    ...(excludeProductIds !== undefined ? { excludeProductIds } : {}),
  };

  try {
    const result = await getAdminRecategorizareListings(adminQuery);
    const ids = (result.items as { id?: string }[]).map((i) => i.id).filter((id): id is string => typeof id === "string");
    const recategorizedMap = await getLastRecategorizedAt(ids);
    const items = (result.items as Record<string, unknown>[]).map((item) => ({
      ...item,
      recategorized_at: recategorizedMap[item.id as string] ?? null,
    }));
    return NextResponse.json({
      success: true,
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      ...(result.totalCount !== undefined ? { totalCount: result.totalCount } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
