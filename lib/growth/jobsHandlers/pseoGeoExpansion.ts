import "server-only";
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { countProducts } from "@/lib/server/products/listingsCountRepo";
import type { ProductQueryStrict } from "@/lib/server/products/listingsWhere";

const MAX_ROWS_PER_RUN = 50;
const MIN_LISTINGS = 3;

/** Categories to use for geo expansion: slug, label, filters for listing query. */
function getGeoCategories(): Array<{ slug: string; label: string; filters: Record<string, unknown> }> {
  const out: Array<{ slug: string; label: string; filters: Record<string, unknown> }> = [];
  for (const [slug, entry] of Object.entries(RO_CATEGORIES)) {
    if (slug === "all") continue;
    out.push({
      slug,
      label: entry.name,
      filters: { categorie: slug },
    });
  }
  return out;
}

/** Slugify county name for URL (lowercase, no diacritics, hyphens). */
function slugFromCountyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "judet";
}

/** Romania counties: load from judete.json. */
function getRomaniaCounties(): Array<{ slug: string; name: string }> {
  try {
    const p = path.join(process.cwd(), "judete.json");
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as { judete?: Array<{ nume?: string; auto?: string }> };
    const judete = data.judete ?? [];
    return judete
      .map((j) => {
        const name = (j.nume ?? "").trim();
        if (!name) return null;
        return { slug: slugFromCountyName(name), name };
      })
      .filter((c): c is { slug: string; name: string } => c != null);
  } catch {
    return [];
  }
}

export async function handlePseoGeoGenerateCandidates(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const geoCategories = getGeoCategories();
    const counties = getRomaniaCounties();
    if (counties.length === 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_geo_generate_candidates",
        meta: { correlationId, inserted: 0, reason: "no_counties" },
      });
      return { ok: true, meta: { inserted: 0 } };
    }

    const { data: existing } = await supabase.from("seo_landing_pages").select("slug");
    const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

    const toInsert: Array<{
      slug: string;
      status: string;
      index_stage: string;
      noindex: boolean;
      title: string | null;
      h1: string | null;
      filters_json: Record<string, unknown>;
      intro_md: string | null;
      faq_json: unknown[];
    }> = [];

    for (const category of geoCategories) {
      if (toInsert.length >= MAX_ROWS_PER_RUN) break;
      for (const county of counties) {
        if (toInsert.length >= MAX_ROWS_PER_RUN) break;
        const slug = `${category.slug}-${county.slug}`;
        if (existingSlugs.has(slug)) continue;

        const filters: Record<string, unknown> = {
          ...category.filters,
          judet: county.slug,
          county: county.name,
        };
        const query: ProductQueryStrict = {
          categorie: category.slug,
          county: county.name,
        };
        const count = await countProducts(query, undefined);
        if (count < MIN_LISTINGS) continue;

        toInsert.push({
          slug,
          status: "draft",
          index_stage: "staged",
          noindex: true,
          title: `${category.label} ${county.name}`,
          h1: `${category.label} ${county.name}`,
          filters_json: filters,
          intro_md: null,
          faq_json: [],
        });
        existingSlugs.add(slug);
      }
    }

    if (toInsert.length === 0) {
      await supabase.from("growth_events").insert({
        type: "pseo_geo_generate_candidates",
        meta: { correlationId, inserted: 0, reason: "no_new_candidates" },
      });
      return { ok: true, meta: { inserted: 0 } };
    }

    const { error } = await supabase.from("seo_landing_pages").insert(toInsert);
    if (error) throw error;
    await supabase.from("growth_events").insert({
      type: "pseo_geo_generate_candidates",
      meta: { correlationId, inserted: toInsert.length, slugs: toInsert.map((r) => r.slug) },
    });
    return { ok: true, meta: { inserted: toInsert.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "pseo_geo_generate_candidates_failed",
      meta: { correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
