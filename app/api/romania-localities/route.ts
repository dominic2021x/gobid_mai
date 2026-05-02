import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const JUDETE_PATH = path.join(process.cwd(), 'judete.json');

type RawLocality = { nume: string; comuna?: string };
type RawJudet = { auto: string; nume: string; localitati: RawLocality[] };
type RawSource = { judete: RawJudet[] };

export type RomaniaLocalitiesResponse = {
  counties: string[];
  byCounty: Record<
    string,
    { cities: string[]; villages: Record<string, string[]> }
  >;
};

// DEV: Clear cache on each request, PROD: Cache in memory
let cached: RomaniaLocalitiesResponse | null = null;

function processJudete(raw: RawSource): RomaniaLocalitiesResponse {
  const counties: string[] = [];
  const byCounty: Record<string, { cities: string[]; villages: Record<string, string[]> }> = {};

  for (const judet of raw.judete || []) {
    const numeJudet = judet.nume?.trim();
    if (!numeJudet) continue;

    counties.push(numeJudet);
    const citiesSet = new Set<string>();
    const villagesByCity: Record<string, string[]> = {};

    for (const loc of judet.localitati || []) {
      const nume = (loc.nume || '').trim();
      if (!nume) continue;

      if (loc.comuna) {
        const comuna = (loc.comuna || '').trim();
        if (comuna) {
          citiesSet.add(comuna);
          if (!villagesByCity[comuna]) villagesByCity[comuna] = [];
          villagesByCity[comuna].push(nume);
        }
      } else {
        citiesSet.add(nume);
      }
    }

    const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ro'));
    const villages: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(villagesByCity)) {
      villages[k] = [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'ro'));
    }

    byCounty[numeJudet] = { cities, villages };
  }

  counties.sort((a, b) => a.localeCompare(b, 'ro'));
  return { counties, byCounty };
}

export async function GET() {
  try {
    // DEV: Always read fresh, PROD: Use cache if available
    if (process.env.NODE_ENV !== "development" && cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const buf = await readFile(JUDETE_PATH, 'utf-8');
    const raw: RawSource = JSON.parse(buf);
    const processed = processJudete(raw);
    
    // Only cache in production
    if (process.env.NODE_ENV !== "development") {
      cached = processed;
    }
    
    return NextResponse.json({ success: true, data: processed });
  } catch (e) {
    console.error('[romania-localities]', e);
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
