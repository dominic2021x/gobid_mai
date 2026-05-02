/**
 * POST /api/admin/search/suggestions/bootstrap
 * Populare inițială search_suggestions din taxonomie, județe, orașe. Idempotent (upsert).
 * Protejat: cron secret sau admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/requireCronSecret";
import { normalizeRo } from "@/lib/search/roNormalize";
import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

type RawLocality = { nume: string; comuna?: string };
type RawJudet = { auto: string; nume: string; localitati: RawLocality[] };
type RawSource = { judete: RawJudet[] };

const JUDETE_PATH = path.join(process.cwd(), "judete.json");

const SUGGESTION_KINDS = [
  "query",
  "category",
  "subcategory",
  "county",
  "city",
  "brand",
  "attribute",
] as const;
type Kind = (typeof SUGGESTION_KINDS)[number];

function isKind(k: string): k is Kind {
  return SUGGESTION_KINDS.includes(k as Kind);
}

async function ensureCronOrAdmin(req: NextRequest): Promise<boolean> {
  try {
    await requireCronSecret(req);
    return true;
  } catch {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token) return false;
    const supabase = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return false;
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    return profile?.is_admin === true;
  }
}

export async function POST(req: NextRequest) {
  const allowed = await ensureCronOrAdmin(req);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const rows: { phrase: string; phrase_norm: string; kind: Kind; popularity: number; meta: Record<string, unknown> }[] = [];

  const now = new Date().toISOString();

  for (const [catSlug, entry] of Object.entries(RO_CATEGORIES)) {
    if (catSlug === "all") continue;
    const name = entry.name?.trim();
    if (!name) continue;
    const phrase_norm = normalizeRo(name);
    if (!phrase_norm) continue;
    rows.push({
      phrase: name,
      phrase_norm,
      kind: "category",
      popularity: 10,
      meta: { categoryId: catSlug },
    });
  }

  for (const [subSlug, name] of Object.entries(RO_SUBCATEGORY_NAMES)) {
    const n = (name as string)?.trim();
    if (!n) continue;
    const phrase_norm = normalizeRo(n);
    if (!phrase_norm) continue;
    rows.push({
      phrase: n,
      phrase_norm,
      kind: "subcategory",
      popularity: 8,
      meta: { subcategoryId: subSlug },
    });
  }

  const seedQueries: string[] = [
    "Apartament 2 camere",
    "Spațiu comercial",
    "Autoutilitară",
    "Buldoexcavator",
    "Teren intravilan",
    "Teren extravilan",
  ];
  for (const phrase of seedQueries) {
    const phrase_norm = normalizeRo(phrase);
    if (phrase_norm) {
      rows.push({
        phrase,
        phrase_norm,
        kind: "query",
        popularity: 5,
        meta: {},
      });
    }
  }

  try {
    const raw = await readFile(JUDETE_PATH, "utf-8");
    const data = JSON.parse(raw) as RawSource;
    const judete = data.judete ?? [];
    const citySet = new Set<string>();
    for (const judet of judete) {
      const numeJudet = judet.nume?.trim();
      if (!numeJudet) continue;
      const phrase_norm = normalizeRo(numeJudet);
      if (phrase_norm) {
        rows.push({
          phrase: numeJudet,
          phrase_norm,
          kind: "county",
          popularity: 5,
          meta: {},
        });
      }
      for (const loc of judet.localitati ?? []) {
        const nume = (loc.nume ?? "").trim();
        if (nume && !citySet.has(nume)) {
          citySet.add(nume);
          const pn = normalizeRo(nume);
          if (pn) {
            rows.push({
              phrase: nume,
              phrase_norm: pn,
              kind: "city",
              popularity: 3,
              meta: {},
            });
          }
        }
        const comuna = (loc as { comuna?: string }).comuna?.trim();
        if (comuna && !citySet.has(comuna)) {
          citySet.add(comuna);
          const pn = normalizeRo(comuna);
          if (pn) {
            rows.push({
              phrase: comuna,
              phrase_norm: pn,
              kind: "city",
              popularity: 2,
              meta: {},
            });
          }
        }
      }
      if (citySet.size >= 1500) break;
    }
  } catch {
    // judete.json lipsă sau invalid – continuăm fără județe/orașe
  }

  const dedupe = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    const key = `${r.phrase_norm}|${r.kind}`;
    if (!dedupe.has(key) || (dedupe.get(key)!.popularity < r.popularity)) {
      dedupe.set(key, r);
    }
  }
  const toUpsert = Array.from(dedupe.values());

  let upserted = 0;
  for (const row of toUpsert) {
    const { error } = await supabase.from("search_suggestions").upsert(
      {
        phrase: row.phrase,
        phrase_norm: row.phrase_norm,
        kind: row.kind,
        popularity: row.popularity,
        meta: row.meta,
        updated_at: now,
      },
      { onConflict: "phrase_norm,kind", ignoreDuplicates: false }
    );
    if (!error) upserted++;
  }

  return NextResponse.json({
    ok: true,
    upserted,
    total: toUpsert.length,
  });
}
