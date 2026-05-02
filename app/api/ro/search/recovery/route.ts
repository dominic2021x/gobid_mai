/**
 * GET /api/ro/search/recovery – plan de recovery la 0 rezultate (alternative + relaxări filtre).
 * Rulează doar când resultCount <= threshold. Fără LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRo } from "@/lib/search/roNormalize";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const optionalStr = z.string().max(100).optional().transform((s) => (s != null && s !== "" ? s.trim() : undefined));

const RecoverySchema = z.object({
  q: z.string().min(1).max(200).transform((s) => s.trim()),
  category: optionalStr,
  subcategory: optionalStr,
  county: optionalStr,
  city: optionalStr,
  resultCount: z.coerce.number().int().min(0),
  threshold: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const DAYS_AGO = 30;

type Alternative = { phrase: string; source: "personal" | "global" };
type Relaxation = { label: string; url: string };

function buildRoUrl(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  return `/ro?${sp.toString()}`;
}

export async function GET(req: NextRequest) {
  const parsed = RecoverySchema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? "",
    category: req.nextUrl.searchParams.get("category") ?? undefined,
    subcategory: req.nextUrl.searchParams.get("subcategory") ?? undefined,
    county: req.nextUrl.searchParams.get("county") ?? undefined,
    city: req.nextUrl.searchParams.get("city") ?? undefined,
    resultCount: req.nextUrl.searchParams.get("resultCount") ?? 0,
    threshold: req.nextUrl.searchParams.get("threshold") ?? 0,
    limit: req.nextUrl.searchParams.get("limit") ?? 5,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid params", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "private, max-age=0" } }
    );
  }

  const { q, category, subcategory, county, city, resultCount, threshold, limit } = parsed.data;

  if (resultCount > threshold) {
    return NextResponse.json(
      { ok: true, enabled: false },
      { headers: { "Cache-Control": "private, max-age=0" } }
    );
  }

  const qNorm = normalizeRo(q);
  const supabase = createAdminClient();
  const alternatives: Alternative[] = [];
  const seenNorm = new Set<string>([qNorm]);

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (token && qNorm.length >= 2) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user?.id) {
      const since = new Date(Date.now() - DAYS_AGO * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("search_events")
        .select("q, q_norm, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .or(`q_norm.eq.${qNorm},q_norm.like.${qNorm}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      const byNorm = new Map<string, string>();
      for (const r of rows ?? []) {
        const row = r as { q: string; q_norm: string };
        if (!byNorm.has(row.q_norm)) byNorm.set(row.q_norm, row.q);
      }
      for (const [norm, phrase] of byNorm.entries()) {
        if (seenNorm.has(norm)) continue;
        seenNorm.add(norm);
        alternatives.push({ phrase, source: "personal" });
        if (alternatives.length >= limit) break;
      }
    }
  }

  if (alternatives.length < limit) {
    const { data: rpcRows } = await supabase.rpc("search_suggestions_rpc", {
      q_norm: qNorm,
      kind_filter: "query",
      lim: 10,
      category: category ?? null,
      subcategory: subcategory ?? null,
      county: county ?? null,
      city: city ?? null,
    });
    const rows = (rpcRows ?? []) as { phrase: string }[];
    for (const row of rows) {
      const phrase = row.phrase?.trim();
      if (!phrase) continue;
      const norm = normalizeRo(phrase);
      if (seenNorm.has(norm)) continue;
      seenNorm.add(norm);
      alternatives.push({ phrase, source: "global" });
      if (alternatives.length >= limit) break;
    }
  }

  const relaxations: Relaxation[] = [];
  const baseParams: Record<string, string> = { q };
  if (category) baseParams.category = category;
  if (subcategory) baseParams.subcategory = subcategory;
  if (county) baseParams.county = county;
  if (city) baseParams.city = city;

  if (city) {
    const p = { ...baseParams };
    delete p.city;
    relaxations.push({
      label: "Caută în tot județul (fără oraș)",
      url: buildRoUrl(p),
    });
  }
  if (subcategory) {
    const p = { ...baseParams };
    delete p.subcategory;
    relaxations.push({
      label: "Caută în toată categoria (fără subcategorie)",
      url: buildRoUrl(p),
    });
  }
  if (category) {
    const p = { ...baseParams };
    delete p.category;
    delete p.subcategory;
    relaxations.push({
      label: "Caută în toate categoriile",
      url: buildRoUrl(p),
    });
  }
  if (county) {
    const p = { ...baseParams };
    delete p.county;
    delete p.city;
    relaxations.push({
      label: "Caută în toată țara (fără județ)",
      url: buildRoUrl(p),
    });
  }

  return NextResponse.json(
    {
      ok: true,
      enabled: true,
      alternatives: alternatives.slice(0, limit),
      relaxations: relaxations.slice(0, 5),
    },
    { headers: { "Cache-Control": "private, max-age=0" } }
  );
}
