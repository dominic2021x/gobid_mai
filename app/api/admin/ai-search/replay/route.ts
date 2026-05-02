/**
 * GET /api/admin/ai-search/replay
 * Admin-only: replay suggest (calls search_suggestions_rpc directly, same as public /suggest).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const fetchCache = 'force-no-store';
const optionalStr = z
  .string()
  .max(200)
  .optional()
  .transform((s) => (s != null && s.trim() !== "" ? s.trim() : undefined));

const ReplayQuerySchema = z.object({
  q: z.string().min(1).max(200).transform((s) => s.trim()),
  category: optionalStr,
  subcategory: optionalStr,
  county: optionalStr,
  city: optionalStr,
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

type RpcRow = {
  phrase: string;
  kind: string;
  popularity: number;
  meta: unknown;
  score?: number;
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const parsed = ReplayQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { q, category, subcategory, county, city, limit } = parsed.data;
  const qNorm = normalizeRo(q);

  if (!qNorm) {
    return NextResponse.json(
      {
        ok: true,
        q,
        qNorm: "",
        items: [],
        debug: { usedContext: false },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase.rpc("search_suggestions_rpc", {
    q_norm: qNorm,
    kind_filter: null,
    lim: limit,
    category: category ?? null,
    subcategory: subcategory ?? null,
    county: county ?? null,
    city: city ?? null,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rpcRows = (rows ?? []) as RpcRow[];
  const items = rpcRows.map((r) => ({
    phrase: r.phrase,
    kind: r.kind,
    popularity: r.popularity,
    meta: (typeof r.meta === "object" && r.meta !== null ? r.meta : {}) as Record<string, unknown>,
  }));

  const usedContext = !!(category || subcategory || county || city);

  return NextResponse.json(
    {
      ok: true,
      q,
      qNorm,
      items,
      debug: { usedContext },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
