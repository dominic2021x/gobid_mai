/**
 * Import Romanian localities into `public.ro_localities` from judete-orase.sql dump.
 *
 * Usage:
 *   npx tsx scripts/geo/importJudeteOraseSql.ts "/absolute/path/to/judete-orase.sql-0.md"
 *
 * Notes:
 * - Accepts raw SQL OR markdown-exported SQL with "L123:" prefixes.
 * - No runtime GitHub fetch; source file must be local.
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

type Row = {
  county_id: number | null;
  county_name: string | null;
  siruta: number | null;
  longitude: number | null;
  latitude: number | null;
  city_name: string;
  source: string;
};

function stripLinePrefixes(raw: string): string {
  return raw.replace(/^L\d+:/gm, "");
}

function splitTupleValues(tupleInner: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < tupleInner.length; i++) {
    const ch = tupleInner[i];
    if (ch === "'" && tupleInner[i - 1] !== "\\") {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}

function unquoteSqlString(v: string): string {
  const t = v.trim();
  if (t.toUpperCase() === "NULL") return "";
  if (t.startsWith("'") && t.endsWith("'")) {
    return t
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/''/g, "'");
  }
  return t;
}

function toNumberOrNull(v: string): number | null {
  const t = unquoteSqlString(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseRows(sql: string): Row[] {
  const rows: Row[] = [];
  const cleaned = stripLinePrefixes(sql);
  const re = /\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/gmu;

  let m: RegExpExecArray | null = re.exec(cleaned);
  while (m) {
    const countyId = Number(m[2]);
    const siruta = Number(m[3]);
    const longitude = Number(m[4]);
    const latitude = Number(m[5]);
    const cityName = m[6]?.trim() ?? "";
    if (cityName) {
      rows.push({
        county_id: Number.isFinite(countyId) ? countyId : null,
        county_name: Number.isFinite(countyId) ? `county_${countyId}` : null,
        siruta: Number.isFinite(siruta) ? siruta : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        city_name: cityName,
        source: "judete-orase.sql",
      });
    }
    m = re.exec(cleaned);
  }

  // fallback parser if regex misses due to format deviations
  if (rows.length > 0) return rows;

  const insertStart = cleaned.indexOf("INSERT INTO `account_city`");
  if (insertStart < 0) return [];
  const valuesStart = cleaned.indexOf("VALUES", insertStart);
  if (valuesStart < 0) return [];
  const end = cleaned.indexOf(";", valuesStart);
  const chunk = cleaned.slice(valuesStart + "VALUES".length, end > -1 ? end : undefined);

  const tuples = chunk.match(/\((?:[^()']+|'(?:\\'|[^'])*')+\)/gmu) ?? [];
  for (const tuple of tuples) {
    const inner = tuple.slice(1, -1);
    const parts = splitTupleValues(inner);
    if (parts.length < 7) continue;
    const city = unquoteSqlString(parts[5]);
    if (!city) continue;
    rows.push({
      county_id: toNumberOrNull(parts[1]),
      county_name: (() => {
        const id = toNumberOrNull(parts[1]);
        return id != null ? `county_${id}` : null;
      })(),
      siruta: toNumberOrNull(parts[2]),
      longitude: toNumberOrNull(parts[3]),
      latitude: toNumberOrNull(parts[4]),
      city_name: city,
      source: "judete-orase.sql",
    });
  }
  return rows;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Missing input file path. Example: npx tsx scripts/geo/importJudeteOraseSql.ts /path/file.sql");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const text = await readFile(inputPath, "utf8");
  const parsed = parseRows(text);
  if (parsed.length === 0) {
    throw new Error("No rows parsed from input.");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // dedupe by city + county_id to keep import idempotent-ish
  const uniq = new Map<string, Row>();
  for (const r of parsed) {
    const key = `${r.city_name.toLowerCase()}|${r.county_id ?? ""}|${r.siruta ?? ""}`;
    if (!uniq.has(key)) uniq.set(key, r);
  }
  const rows = [...uniq.values()];
  console.log(`[importJudeteOraseSql] parsed=${parsed.length} unique=${rows.length}`);

  const batch = 1000;
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const { error } = await supabase.from("ro_localities").upsert(slice, {
      onConflict: "city_name,county_name",
      ignoreDuplicates: false,
    });
    if (error) throw error;
    console.log(`[importJudeteOraseSql] upsert ${i + 1}-${Math.min(i + batch, rows.length)}`);
  }
  console.log("[importJudeteOraseSql] done");
}

main().catch((e) => {
  console.error("[importJudeteOraseSql] failed", e);
  process.exit(1);
});
