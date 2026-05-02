/**
 * Admin recategorizare: list all products with same filters as /ro, plus title search and cursor pagination.
 * No channel gating (admin sees all). Uses Prisma.
 */

import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/server/db";
import { buildPrismaWhereStrictAdmin } from "@/lib/server/products/listingsWhere";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";

const ADMIN_LISTING_SELECT = {
  id: true,
  title: true,
  slug: true,
  url: true,
  images: true,
  category: true,
  subcategory: true,
  category_level_3: true,
  // category_level_4: true, — activează după ce rulezi migrarea 20260221_products_category_level4.sql și npx prisma generate
  size: true,
  brand: true,
  model: true,
  color: true,
  condition: true,
  starting_price_ron: true,
  starting_price_eur: true,
  product_type: true,
  sale_type: true,
  status: true,
  county: true,
  city: true,
  product_location: true,
  auction_date: true,
  custom_fields: true,
  created_at: true,
  updated_at: true,
} as const;

export type AdminListingsQuery = ProductQuery & {
  titleSearch?: string;
  titleSearchMode?: "and" | "or" | "exact";
  cursor?: string;
  page?: number; // 1-based; when set, offset pagination is used instead of cursor
  pageSize?: number;
  includeCount?: boolean; // when true, result includes totalCount for current filters
  /** exclude these product IDs from results (e.g. IDs that have been recategorized, from audit via Supabase) */
  excludeProductIds?: string[];
};

export type AdminListingsResult = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
};

function buildTitleSearchWhere(
  titleSearch: string,
  mode: "and" | "or" | "exact"
): Prisma.productsWhereInput {
  // Normalize: orice secvență de spații (inclusiv tab, non-breaking space) → un singur spațiu, apoi trim
  const normalized = titleSearch.replace(/\s+/g, " ").trim();
  if (!normalized) return {};

  if (mode === "exact") {
    return { title: { contains: normalized, mode: "insensitive" } };
  }

  // Split explicit după spațiu ca separator între cuvinte
  const words = normalized.split(" ").map((w) => w.trim()).filter((w) => w.length >= 1);
  if (words.length === 0) return {};

  if (mode === "or") {
    return {
      OR: words.map((word) => ({
        title: { contains: word, mode: "insensitive" as const },
      })),
    };
  }

  // and
  return {
    AND: words.map((word) => ({
      title: { contains: word, mode: "insensitive" as const },
    })),
  };
}

function parseCursor(cursor: string | undefined): { updated_at: Date; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { updated_at: string; id: string };
    if (!parsed.updated_at || !parsed.id) return null;
    const date = new Date(parsed.updated_at);
    if (Number.isNaN(date.getTime())) return null;
    return { updated_at: date, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(updated_at: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ updated_at: updated_at.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

function buildCursorWhere(cursor: string | undefined): Prisma.productsWhereInput | null {
  const c = parseCursor(cursor);
  if (!c) return null;
  return {
    OR: [
      { updated_at: { lt: c.updated_at } },
      { updated_at: c.updated_at, id: { lt: c.id } },
    ],
  };
}

export async function getAdminRecategorizareListings(
  query: AdminListingsQuery
): Promise<AdminListingsResult> {
  const pageSize = Math.min(Math.max(1, query.pageSize ?? query.limit ?? 50), 5000);

  const paramsForWhere: ProductQuery = { ...query };
  if (query.titleSearch?.trim()) {
    paramsForWhere.q = undefined;
  }

  const baseWhere = buildPrismaWhereStrictAdmin(paramsForWhere);
  const titleWhere =
    query.titleSearch?.trim() && query.titleSearchMode
      ? buildTitleSearchWhere(query.titleSearch.trim(), query.titleSearchMode)
      : null;
  const usePage = query.page != null && query.page >= 1;
  const cursorWhere = usePage ? null : buildCursorWhere(query.cursor);

  const andConditions: Prisma.productsWhereInput[] = [baseWhere];
  if (titleWhere) andConditions.push(titleWhere);
  if (cursorWhere) andConditions.push(cursorWhere);
  if (query.excludeProductIds?.length) {
    andConditions.push({ id: { notIn: query.excludeProductIds } });
  }
  const where: Prisma.productsWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  // For total count we use the same filters but without cursor (full result set)
  const countWhereConditions: Prisma.productsWhereInput[] = [baseWhere];
  if (titleWhere) countWhereConditions.push(titleWhere);
  if (query.excludeProductIds?.length) {
    countWhereConditions.push({ id: { notIn: query.excludeProductIds } });
  }
  const countWhere: Prisma.productsWhereInput =
    countWhereConditions.length > 0 ? { AND: countWhereConditions } : {};

  const [items, totalCount] = await Promise.all([
    (async () => {
      const pageNum = usePage ? Math.floor(query.page as number) : 1;
      const skip = usePage ? (pageNum - 1) * pageSize : undefined;
      const take = pageSize + 1;
      return prisma.products.findMany({
        where,
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        skip,
        take,
        select: ADMIN_LISTING_SELECT,
      });
    })(),
    query.includeCount
      ? prisma.products.count({ where: countWhere })
      : Promise.resolve(undefined),
  ]);

  const rows = items as unknown as Record<string, unknown>[];
  const hasMore = rows.length > pageSize;
  const slice = hasMore ? rows.slice(0, pageSize) : rows;
  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last && typeof last.updated_at === "object" && typeof last.id === "string"
      ? encodeCursor(last.updated_at as Date, last.id)
      : null;

  return {
    items: slice,
    nextCursor,
    hasMore,
    ...(totalCount !== undefined ? { totalCount } : {}),
  };
}
