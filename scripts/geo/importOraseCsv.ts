/**
 * Bootstrap geo_counties + geo_places + geo_place_aliases from orase.csv.
 * Source: https://github.com/romania/localitati/blob/master/orase.csv
 * Idempotent: safe to re-run. Uses normalizeLocation for name_norm.
 *
 * Run: npx tsx scripts/geo/importOraseCsv.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocation } from "@/lib/search/geo/normalizeLocation";

const ORASE_CSV_URL = "https://raw.githubusercontent.com/romania/localitati/master/orase.csv";

type CsvRow = {
  x: string;
  y: string;
  nume: string;
  judet: string;
  judetAuto: string;
  populatie: string;
  regiune: string;
};

function parseCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

function parseRow(cols: string[], header: string[]): CsvRow | null {
  const get = (i: number) => cols[i]?.trim() ?? "";
  const nume = get(2);
  const judet = get(3);
  const judetAuto = get(4);
  if (!nume || !judet) return null;
  return {
    x: get(0),
    y: get(1),
    nume,
    judet,
    judetAuto: judetAuto || judet.slice(0, 2).toUpperCase(),
    populatie: get(5),
    regiune: get(6),
  };
}

function parsePop(s: string): number {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 0..1 from population (log scale). */
function importanceFromPopulation(pop: number): number {
  if (pop <= 0) return 0.5;
  const logPop = Math.log10(pop + 1);
  return Math.min(1, Math.max(0.1, (logPop - 2) / 4));
}

async function fetchCsv(): Promise<string> {
  const res = await fetch(ORASE_CSV_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  const supabase = createAdminClient();
  const csv = await fetchCsv();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = parseRow(cols, header);
    if (row) rows.push(row);
  }

  const countyByCode = new Map<string, { id: string; name: string }>();
  const seenCountyCode = new Set<string>();
  const seenPlaceKey = new Set<string>();
  let countiesInserted = 0;
  let placesInserted = 0;
  let placesUpdated = 0;
  let aliasesInserted = 0;
  const missingCoords: string[] = [];
  const duplicatePlaceKeys: string[] = [];

  for (const row of rows) {
    const codeNorm = (row.judetAuto || row.judet.slice(0, 2)).toUpperCase().trim();
    const countyNameNorm = normalizeLocation(row.judet);
    if (!countyNameNorm) continue;

    let countyId = countyByCode.get(codeNorm)?.id;
    if (!countyId && seenCountyCode.has(codeNorm)) {
      const { data: existing } = await supabase
        .from("geo_counties")
        .select("id, name")
        .eq("code", codeNorm)
        .maybeSingle();
      if (existing) {
        countyId = (existing as { id: string }).id;
        countyByCode.set(codeNorm, { id: countyId, name: (existing as { name: string }).name });
      }
    }
    if (!countyId) {
      const { data: existing } = await supabase
        .from("geo_counties")
        .select("id, name")
        .eq("code", codeNorm)
        .maybeSingle();
      if ((existing as { id: string } | null)?.id) {
        countyId = (existing as { id: string }).id;
        countyByCode.set(codeNorm, { id: countyId, name: (existing as { name: string }).name });
      } else {
        const { data: inserted, error } = await supabase
          .from("geo_counties")
          .insert({ code: codeNorm, name: row.judet.trim(), name_norm: countyNameNorm })
          .select("id, name")
          .single();
        if (!error && inserted) {
          countyId = (inserted as { id: string }).id;
          countyByCode.set(codeNorm, { id: countyId, name: (inserted as { name: string }).name });
          countiesInserted++;
        }
      }
      seenCountyCode.add(codeNorm);
    }
    if (!countyId) continue;

    const placeNameNorm = normalizeLocation(row.nume);
    if (!placeNameNorm || placeNameNorm.length < 2) continue;

    const placeKey = `${countyId}|${placeNameNorm}`;
    if (seenPlaceKey.has(placeKey)) {
      duplicatePlaceKeys.push(`${row.nume} (${row.judet})`);
      continue;
    }
    seenPlaceKey.add(placeKey);

    const lat = parseFloat(row.y);
    const lng = parseFloat(row.x);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      missingCoords.push(`${row.nume}, ${row.judet}`);
    }
    const pop = parsePop(row.populatie);
    const importance = importanceFromPopulation(pop);
    const populationRank = pop > 0 ? Math.max(1, 10000 - Math.min(10000, pop)) : null;

    const { data: existingPlace } = await supabase
      .from("geo_places")
      .select("id")
      .eq("county_id", countyId)
      .eq("name_norm", placeNameNorm)
      .maybeSingle();

    const placePayload = {
      county_id: countyId,
      name: row.nume.trim(),
      name_norm: placeNameNorm,
      type: "city" as const,
      parent_place_id: null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      population_rank: populationRank,
      importance_score: Math.round(importance * 10000) / 10000,
      updated_at: new Date().toISOString(),
    };

    if ((existingPlace as { id: string } | null)?.id) {
      const { error: upErr } = await supabase
        .from("geo_places")
        .update(placePayload)
        .eq("id", (existingPlace as { id: string }).id);
      if (!upErr) placesUpdated++;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("geo_places")
        .insert({ ...placePayload, parent_place_id: null })
        .select("id")
        .single();
      if (!insErr && inserted) {
        placesInserted++;
        const placeId = (inserted as { id: string }).id;
        const aliasNorm = normalizeLocation(row.nume);
        if (aliasNorm && aliasNorm.length >= 2) {
          await supabase.from("geo_place_aliases").upsert(
            { place_id: placeId, alias: row.nume.trim(), alias_norm: aliasNorm },
            { onConflict: "place_id,alias_norm", ignoreDuplicates: false }
          );
          aliasesInserted++;
        }
      }
    }
  }

  console.log("Counties inserted/updated:", countiesInserted);
  console.log("Places inserted:", placesInserted, "updated:", placesUpdated);
  console.log("Aliases inserted:", aliasesInserted);
  if (missingCoords.length > 0) {
    console.log("Missing coordinates (first 20):", missingCoords.slice(0, 20));
  }
  if (duplicatePlaceKeys.length > 0) {
    console.log("Duplicate (name_norm+county) skipped (first 20):", duplicatePlaceKeys.slice(0, 20));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
