import { normalizeRo } from "./roNormalize";
import type { SearchResult } from "./types";
import { detectCityCountyFromQuery } from "./localitiesCache";
import { buildQueryPipeline } from "./queryPipeline";

export type ParsedSearchIntent = {
  originalQuery: string;
  normalizedQuery: string;
  cleanedQuery: string;
  rooms: number | null;
  city: string | null;
  county: string | null;
  category: "imobiliare" | "auto" | null;
  cheapIntent: boolean;
};

const CITY_ALIASES: Record<string, string> = {
  bucuresti: "Bucuresti",
  cluj: "Cluj",
  "cluj napoca": "Cluj-Napoca",
  timisoara: "Timisoara",
  iasi: "Iasi",
  constanta: "Constanta",
  brasov: "Brasov",
  craiova: "Craiova",
  galati: "Galati",
  ploiesti: "Ploiesti",
  oradea: "Oradea",
  sibiu: "Sibiu",
  arad: "Arad",
  pitesti: "Pitesti",
  "targu mures": "Targu Mures",
  bacau: "Bacau",
  "baia mare": "Baia Mare",
  suceava: "Suceava",
  botosani: "Botosani",
};

const AUTO_BRANDS = new Set([
  "audi",
  "bmw",
  "mercedes",
  "volkswagen",
  "vw",
  "skoda",
  "renault",
  "dacia",
  "ford",
  "opel",
  "toyota",
  "honda",
  "nissan",
  "mazda",
  "kia",
  "hyundai",
  "peugeot",
  "citroen",
  "fiat",
  "seat",
  "suzuki",
  "tesla",
  "lexus",
  "volvo",
  "jaguar",
  "land rover",
  "porsche",
  "ferrari",
  "lamborghini",
]);

const CHEAP_TERMS = [
  "ieftin",
  "ieftina",
  "ieftine",
  "ieftini",
  "convenabil",
  "convenabila",
  "buget",
  "chilipir",
  "best price",
  "pret mic",
  "preturi mici",
];

function detectRooms(normalizedQuery: string): number | null {
  const m = normalizedQuery.match(/\b([1-9]|10)\s*cam(?:era|ere)?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function detectCityCounty(normalizedQuery: string): Promise<{ city: string | null; county: string | null }> {
  const dynamic = await detectCityCountyFromQuery(normalizedQuery);
  if (dynamic.city || dynamic.county) return dynamic;

  const q = ` ${normalizedQuery} `;
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (q.includes(` ${alias} `)) return { city, county: null };
  }
  return { city: null, county: null };
}

function detectCategory(normalizedQuery: string): "imobiliare" | "auto" | null {
  const q = ` ${normalizedQuery} `;
  if (
    q.includes(" apartament ") ||
    q.includes(" casa ") ||
    q.includes(" garsoniera ") ||
    q.includes(" teren ") ||
    q.includes(" imobiliar ")
  ) {
    return "imobiliare";
  }
  if (
    q.includes(" auto ") ||
    q.includes(" autoturism ") ||
    q.includes(" masina ") ||
    q.includes(" suv ") ||
    [...AUTO_BRANDS].some((b) => q.includes(` ${b} `))
  ) {
    return "auto";
  }
  return null;
}

function detectCheapIntent(normalizedQuery: string): boolean {
  const q = ` ${normalizedQuery} `;
  return CHEAP_TERMS.some((t) => q.includes(` ${t} `));
}

export async function parseSearchIntent(query: string): Promise<ParsedSearchIntent> {
  const pipeline = buildQueryPipeline(query);
  const normalizedQuery = pipeline.tokens.join(" ");
  const rooms = detectRooms(normalizedQuery);
  const { city, county } = await detectCityCounty(normalizedQuery);
  const category = detectCategory(normalizedQuery);
  const cheapIntent = detectCheapIntent(normalizedQuery);

  let cleanedQuery = normalizedQuery;
  if (rooms != null) {
    cleanedQuery = cleanedQuery.replace(/\b([1-9]|10)\s*cam(?:era|ere)?\b/g, " ");
  }
  if (city) {
    for (const alias of Object.keys(CITY_ALIASES)) {
      cleanedQuery = cleanedQuery.replace(new RegExp(`\\b${alias}\\b`, "g"), " ");
    }
  }
  for (const term of CHEAP_TERMS) {
    cleanedQuery = cleanedQuery.replace(new RegExp(`\\b${term}\\b`, "g"), " ");
  }
  cleanedQuery = cleanedQuery.replace(/\s+/g, " ").trim();
  if (!cleanedQuery) cleanedQuery = normalizedQuery;

  return {
    originalQuery: query.trim(),
    normalizedQuery,
    cleanedQuery,
    rooms,
    city,
    county,
    category,
    cheapIntent,
  };
}

export function buildIntentExpandedQueries(intent: ParsedSearchIntent): string[] {
  const out = new Set<string>();
  if (intent.originalQuery) out.add(intent.originalQuery);
  if (intent.normalizedQuery) out.add(intent.normalizedQuery);
  if (intent.cleanedQuery) out.add(intent.cleanedQuery);

  const qn = ` ${intent.normalizedQuery} `;
  if (qn.includes(" apartament ")) out.add(intent.normalizedQuery.replace(/\bapartament\b/g, "apartamente"));
  if (qn.includes(" apartamente ")) out.add(intent.normalizedQuery.replace(/\bapartamente\b/g, "apartament"));
  if (qn.includes(" casa ")) out.add(intent.normalizedQuery.replace(/\bcasa\b/g, "case"));
  if (qn.includes(" case ")) out.add(intent.normalizedQuery.replace(/\bcase\b/g, "casa"));

  return [...out].filter((q) => q.trim().length > 0);
}

export function applyIntentBoosts(results: SearchResult[], intent: ParsedSearchIntent): SearchResult[] {
  if (results.length === 0) return results;
  return results.map((r) => {
    const category = String(r.category ?? "").toLowerCase();
    const sub = String(r.metadata?.subcategory ?? "").toLowerCase();
    const city = String(r.metadata?.city ?? "").toLowerCase();
    const county = String(r.metadata?.county ?? "").toLowerCase();
    const title = String(r.title ?? "").toLowerCase();
    const desc = String(r.description ?? "").toLowerCase();
    const roomsText = `${title} ${desc} ${sub}`;

    let boost = 0;

    if (intent.category === "imobiliare") {
      if (category.includes("imobil")) boost += 0.5;
      else if (sub.includes("apart") || sub.includes("casa") || sub.includes("teren")) boost += 0.35;
    } else if (intent.category === "auto") {
      if (category.includes("auto")) boost += 0.5;
      else if (sub.includes("auto") || sub.includes("autotur") || sub.includes("suv")) boost += 0.3;
    }

    if (intent.city) {
      const cityNorm = normalizeRo(intent.city).toLowerCase();
      if (city.includes(cityNorm)) boost += 0.25;
    }
    if (intent.county) {
      const countyNorm = normalizeRo(intent.county).toLowerCase();
      if (county.includes(countyNorm)) boost += 0.2;
    }

    if (intent.rooms != null) {
      const roomPattern = new RegExp(`\\b${intent.rooms}\\s*cam(?:era|ere)?\\b`);
      if (roomPattern.test(roomsText)) boost += 0.25;
    }

    if (intent.cheapIntent && typeof r.price === "number") {
      if (r.price <= 50_000) boost += 0.35;
      else if (r.price <= 150_000) boost += 0.2;
    }

    if (boost <= 0) return r;
    return {
      ...r,
      score: Math.min(2, (r.score ?? 0) + boost),
      metadata: {
        ...(r.metadata ?? {}),
        intent_boost: boost,
      },
    };
  });
}
