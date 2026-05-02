/**
 * API Route pentru Sugestii de Căutare (Autocomplete)
 * Request path: UI -> GET /api/search/suggestions?q=... -> DB (search_suggestions RPC + products/popular) -> response -> UI.
 * DB-backed suggestions first (search_suggestions_rpc), then brands/categories/products. Fallback trending when empty.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { optimizeQuery } from '@/lib/ai/fuzzy-search';
import { analyzeQuery } from '@/lib/ai/brand-detector';
import { supabaseAdmin } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripDiacritics } from '@/lib/search/normalize';
import { normalizeRo } from '@/lib/search/roNormalize';
import { checkSuggestRateLimit } from '@/lib/search/suggestRateLimit';
import { ROMANIAN_CITIES } from '@/lib/data/romanian-cities';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 3;

const SUGGEST_CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=50';
const LIMIT_MIN = 5;
const LIMIT_MAX = 20;

/** Mapare categorie brand la nume afișat pe /ro (local ca să nu depindem de export din brand-detector în app-route) */
const BRAND_CATEGORY_TO_DISPLAY: Record<string, string> = {
  'Auto': 'Autovehicule',
  'Electronice': 'Electronice & Tehnologie',
  'Îmbrăcăminte': 'Modă & Lifestyle',
  'Bijuterii': 'Bijuterii',
  'Mobilier': 'Mobilier',
  'Încălțăminte': 'Modă & Lifestyle',
};

/** Branduri pentru autocomplete după prefix (subset folosit doar aici) */
const BRANDS_PREFIX_ENTRIES: { key: string; fullBrand: string; category: string }[] = [
  { key: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  { key: 'mercedes', fullBrand: 'Mercedes-Benz', category: 'Auto' },
  { key: 'audi', fullBrand: 'Audi', category: 'Auto' },
  { key: 'vw', fullBrand: 'Volkswagen', category: 'Auto' },
  { key: 'volkswagen', fullBrand: 'Volkswagen', category: 'Auto' },
  { key: 'opel', fullBrand: 'Opel', category: 'Auto' },
  { key: 'ford', fullBrand: 'Ford', category: 'Auto' },
  { key: 'dacia', fullBrand: 'Dacia', category: 'Auto' },
  { key: 'apple', fullBrand: 'Apple', category: 'Electronice' },
  { key: 'iphone', fullBrand: 'Apple', category: 'Electronice' },
  { key: 'samsung', fullBrand: 'Samsung', category: 'Electronice' },
  { key: 'xiaomi', fullBrand: 'Xiaomi', category: 'Electronice' },
  { key: 'huawei', fullBrand: 'Huawei', category: 'Electronice' },
  { key: 'nike', fullBrand: 'Nike', category: 'Îmbrăcăminte' },
  { key: 'adidas', fullBrand: 'Adidas', category: 'Îmbrăcăminte' },
  { key: 'jaguar', fullBrand: 'Jaguar', category: 'Auto' },
];

function getBrandsByPrefix(prefix: string): Array<{ fullBrand: string; category?: string }> {
  const p = (prefix || '').toLowerCase().trim();
  if (p.length < 2) return [];
  const seen = new Set<string>();
  const out: Array<{ fullBrand: string; category?: string }> = [];
  for (const { key, fullBrand, category } of BRANDS_PREFIX_ENTRIES) {
    if (seen.has(fullBrand)) continue;
    if (key.startsWith(p) || fullBrand.toLowerCase().startsWith(p)) {
      seen.add(fullBrand);
      out.push({ fullBrand, category });
    }
  }
  return out.slice(0, 5);
}

/** Categorii principale (aficate ca CATEGORII în dropdown) */
const MAIN_CATEGORIES = new Set([
  'Imobiliare', 'Executări', 'Autovehicule', 'Electronice & Tehnologie',
  'Utilaje & Echipamente', 'Artă & Antichități', 'Modă & Lifestyle', 'Mama și copilul',
]);

/** Când user scrie DOAR categorie principală – nu sugerăm subcategorii, doar categoria + oraș dacă scrie */
const MAIN_CATEGORY_STRICT_TERMS: Record<string, string[]> = {
  'Imobiliare': ['imobiliare', 'imobiliar', 'imobil'],
  'Executări': ['executari', 'executare', 'insolventa'],
  'Autoturisme': ['autoturisme', 'autoturism'],
  'Autovehicule': ['autovehicule', 'autovehicul'],
};

/** Orașe care încep cu prefix (normalizat, fără diacritice); max 8 */
function getCitiesByPrefix(prefix: string): string[] {
  const p = stripDiacritics(prefix.trim().toLowerCase());
  if (p.length < 2) return [];
  return ROMANIAN_CITIES.filter((c) => stripDiacritics(c.toLowerCase()).startsWith(p)).slice(0, 8);
}

/** Fallback când DB returnează 0 sugestii sau la eroare (doar public, fără canale gated) */
const FALLBACK_TRENDING = [
  'Apartamente',
  'Autoturisme',
  'Piese auto',
  'Terenuri',
  'iPhone',
  'Laptop',
  'Mobilier',
  'Spațiu comercial',
];

/** Mapare display (subcategorie) la slug din DB – pentru matchesReal când realSubcategorySet conține slug-uri */
const SUBDISPLAY_TO_SLUG: Record<string, string> = {
  'Case și Vile': 'case-vile',
  'Apartamente': 'apartamente',
  'Terenuri': 'terenuri',
  'Spații Comerciale': 'spatii-comerciale',
  'Autoturisme': 'autoturisme',
  'Piese auto': 'piese-auto',
  'Telefoane': 'telefoane',
  'Laptopuri': 'laptopuri-pc',
  'Mobilier': 'mobilier-interior',
  'Executări': 'executari',
};

/** Lista completă piese auto – pentru sugestii categorii și extragere din titluri */
const PIESE_AUTO_TERMS = [
  'usa', 'ușă', 'usi', 'uși', 'portiera', 'portieră', 'aripa', 'aripă', 'aripi', 'capota', 'capotă', 'capote',
  'far', 'fari', 'faruri', 'bara', 'bară', 'bari', 'bumper', 'parbriz', 'geam', 'geamuri', 'oglinda', 'oglindă', 'oglinzi',
  'spoiler', 'grila', 'grilă', 'rezedor', 'bloc', 'motor', 'transmisie', 'cutie', 'cutii', 'viteze', 'roata', 'roți', 'roti',
  'janta', 'jantă', 'jante', 'amortizor', 'amortizoare', 'cardan', 'etrier', 'etrieri', 'etriere', 'placute', 'plăcute',
  'frane', 'frâne', 'filtru', 'filtre', 'bujii', 'distributie', 'distribuție', 'alternator', 'baterie', 'starter',
  'senzor', 'senzori', 'radiator', 'pompa', 'pompă', 'apa', 'apă', 'termostat', 'arbore', 'cotit', 'piston', 'pistoni',
  'chiulasa', 'chiulașă', 'biela', 'bielă', 'segment', 'intercooler', 'turbo', 'egr', 'dpf', 'sonda', 'lambda',
  'centrala', 'centrală', 'ecu', 'bobina', 'distribuitor', 'releu', 'pornire', 'ambreiaj', 'volant', 'convertizor',
  'diferential', 'diferențial', 'arc', 'brate', 'articulatie', 'articulație', 'rulment', 'stabilizator',
  'silent', 'bieleta', 'bieletă', 'bielete', 'trapez', 'directie', 'direcție', 'servodirectie', 'scaun', 'scaune',
  'bord', 'volan', 'covoras', 'covoraș', 'tapis', 'consola', 'consolă', 'airbag', 'centura', 'centură', 'banc',
  'anvelopa', 'anvelopă', 'anvelope', 'reductor', 'kit', 'caroserie', 'suspensie', 'display', 'optronic',
  'portbagaj', 'manivela', 'pedale', 'comanda', 'axe', 'butuc', 'discuri', 'hidraulic', 'tetiera', 'tetieră'
];

/** Categorii și subcategorii pentru autocomplete – nume afișat + variante de căutare (inclusiv greșeli frecvente) */
const CATEGORY_SUGGESTIONS: { display: string; terms: string[] }[] = [
  { display: 'Imobiliare', terms: ['imobiliare', 'imobiliar', 'imobil'] },
  { display: 'Apartamente', terms: ['apartamente', 'apartament', 'apartamant', 'apartamentele', 'apar', '2 camere', '3 camere', 'camere'] },
  { display: 'Case și Vile', terms: ['case-vile', 'case', 'vile', 'casa', 'casă', 'vila', 'vilă'] },
  { display: 'Terenuri', terms: ['terenuri', 'teren', 'terenuri-intravilane', 'terenuri-agricole'] },
  { display: 'Spații Comerciale', terms: ['spatii-comerciale', 'spatii', 'comercial', 'spatiu'] },
  { display: 'Executări', terms: ['executari', 'executare', 'insolventa', 'insolventă'] },
  { display: 'Autovehicule', terms: ['autovehicule', 'auto', 'masini', 'masina', 'autoturisme'] },
  { display: 'Autoturisme', terms: ['autoturisme', 'autoturism'] },
  { display: 'Piese auto', terms: ['piese-auto', 'piese', ...PIESE_AUTO_TERMS.slice(0, 80)] },
  { display: 'Telefoane', terms: ['telefoane', 'telefon', 'telefoanele', 'tel', 'iphone', 'samsung', 'xiaomi'] },
  { display: 'Laptopuri', terms: ['laptopuri', 'laptop', 'lap'] },
  { display: 'Electronice & Tehnologie', terms: ['electronice', 'tehnologie', 'electronice-tehnologie', 'electro'] },
  { display: 'Utilaje & Echipamente', terms: ['utilaje', 'echipamente', 'utilaj', 'utilaje-echipamente'] },
  { display: 'Artă & Antichități', terms: ['arta', 'antichitati', 'antichitati', 'arte'] },
  { display: 'Modă & Lifestyle', terms: ['moda', 'lifestyle', 'haine', 'incaltaminte'] },
  { display: 'Mama și copilul', terms: ['mama-copil', 'mama si copilul', 'copil', 'bebelus', 'jucarii', 'carucioare', 'cosul copilului'] },
  { display: 'Bijuterii', terms: ['bijuterii', 'bijuterie', 'bij'] },
  { display: 'Mobilier', terms: ['mobilier', 'mobilă', 'mobila'] },
];

/**
 * Inferă categoria afișată din textul sugestiei (pentru a evita categorii greșite din DB sau analyzeQuery).
 * Ex: "casă confortabilă" -> Imobiliare, "geantă piele" -> Modă & Lifestyle.
 */
function inferCategoryFromSuggestionText(text: string): string | undefined {
  const lower = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const raw = (text || '').toLowerCase();
  if (/\b(casa|casă|case|vila|vilă|vile|apartament|teren|imobil|spatiu|spațiu|comercial|camere|mp|suprafata)\b/.test(raw) || /\b(casa|case|vila|vile|apartament|teren|imobil)\b/.test(lower)) return 'Imobiliare';
  if (/\b(geanta|geantă|haina|haină|incaltaminte|încălțăminte|moda|modă|lifestyle|pantofi|rochie|bluga)\b/.test(raw) || /\b(geanta|haina|incaltaminte|pantofi|rochie)\b/.test(lower)) return 'Modă & Lifestyle';
  if (/\b(telefon|iphone|samsung|xiaomi|laptop|tableta|tv|monitor|electronice|tehnologie)\b/.test(raw) || /\b(telefon|iphone|laptop|tv|electronice)\b/.test(lower)) return 'Electronice & Tehnologie';
  const hasPiesaAuto = PIESE_AUTO_TERMS.some((t) => raw.includes(t) || lower.includes(t));
  if (/\b(masina|mașină|auto|autoturism|bmw|mercedes|audi|vw|dacia|ford|piese)\b/.test(raw) || hasPiesaAuto) return 'Autovehicule';
  if (/\b(bijuterie|ceas|ceasuri|colier|bratara|inel)\b/.test(raw) || /\b(bijuterie|ceas|colier|bratara|inel)\b/.test(lower)) return 'Bijuterii';
  if (/\b(mobilier|mobilă|canapea|dulap|pat|birou|scaun)\b/.test(raw) || /\b(mobilier|canapea|dulap|pat|birou)\b/.test(lower)) return 'Mobilier';
  if (/\b(utilaj|excavator|buldozer|constructii|echipament)\b/.test(raw) || /\b(utilaj|excavator|constructii)\b/.test(lower)) return 'Utilaje & Echipamente';
  if (/\b(arta|tablou|antichitat|pictura|sculptura)\b/.test(raw) || /\b(arta|tablou|antichitat|pictura)\b/.test(lower)) return 'Artă & Antichități';
  if (/\b(mama|copil|bebelus|jucarie|carucioare|cosul copilului)\b/.test(raw) || /\b(mama|copil|bebelus|jucarie|carucioare)\b/.test(lower)) return 'Mama și copilul';
  if (/\b(executare|insolventa|licitatie silita)\b/.test(raw) || /\b(executare|insolventa)\b/.test(lower)) return 'Executări';
  return undefined;
}

/** Corecții tip "apartamant" -> "Apartament" etc. Inclusiv "casa" -> "Case și Vile", piese auto. */
const TYPO_TO_DISPLAY: Record<string, string> = {
  casa: 'Case și Vile',
  casă: 'Case și Vile',
  usa: 'Piese auto',
  ușă: 'Piese auto',
  usi: 'Piese auto',
  oglinda: 'Piese auto',
  oglindă: 'Piese auto',
  etrier: 'Piese auto',
  etrieri: 'Piese auto',
  senzor: 'Piese auto',
  senzori: 'Piese auto',
  alternator: 'Piese auto',
  parbriz: 'Piese auto',
  apartamant: 'Apartament',
  apartamente: 'Apartamente',
  apartamentele: 'Apartamente',
  imobiliar: 'Imobiliare',
  imobil: 'Imobiliare',
  masina: 'Autovehicule',
  masini: 'Autovehicule',
  telefon: 'Telefoane',
  telefoanele: 'Telefoane',
  laptop: 'Laptopuri',
  electro: 'Electronice & Tehnologie',
  utilaj: 'Utilaje & Echipamente',
  antichitati: 'Artă & Antichități',
  bijuterie: 'Bijuterii',
};

/** Termeni care indică subcategorie – când apar, nu aplicăm "doar categorie principală" */
const SUBCATEGORY_INDICATOR_TERMS = new Set([
  'apartament', 'apartamente', 'apartamant', 'camere', 'casa', 'casă', 'case', 'vila', 'vilă', 'vile',
  'teren', 'terenuri', 'spatii', 'spatiu', 'comercial', 'piese', 'usa', 'ușă', 'aripa', 'far', 'parbriz',
  'masina', 'masini', 'masină', 'mașini', 'telefon', 'iphone', 'laptop', 'telefoane', 'laptopuri',
]);

/** Detectează oraș în query: ultimul token sau ultimele două (ex. "Alba Iulia") ca prefix */
function detectCityInQuery(lowerQuery: string): { city: string; baseQuery: string } | null {
  const norm = stripDiacritics(lowerQuery.trim().toLowerCase());
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  const last2 = tokens.length >= 2 ? `${tokens[tokens.length - 2]} ${last}` : last;
  const cities1 = getCitiesByPrefix(last);
  const cities2 = getCitiesByPrefix(last2);
  if (cities2.length > 0) {
    const city = cities2[0];
    const base = tokens.slice(0, -2).join(' ').trim();
    if (base.length >= 2) return { city, baseQuery: base };
  }
  if (cities1.length > 0 && last.length >= 2) {
    const city = cities1[0];
    const base = tokens.slice(0, -1).join(' ').trim();
    if (base.length >= 1) return { city, baseQuery: base };
  }
  return null;
}

function getCategorySuggestions(lowerQuery: string): string[] {
  const { categories, subcategories } = getCategoriesAndSubcategories(lowerQuery);
  return [...categories, ...subcategories].slice(0, 8);
}

/** Împarte sugestiile în categorii principale și subcategorii. Când user scrie DOAR categorie principală (ex. Imobiliare, Autoturisme), nu returnăm subcategorii. */
function getCategoriesAndSubcategories(lowerQuery: string): {
  categories: string[];
  subcategories: string[];
  isMainCategoryOnly: boolean;
} {
  const all = new Set<string>();
  const norm = (lowerQuery || '').replace(/\s+/g, ' ').trim();
  const normNoDiac = stripDiacritics(norm.toLowerCase());
  if (norm.length < 2) return { categories: [], subcategories: [], isMainCategoryOnly: false };

  const typoMatch = TYPO_TO_DISPLAY[norm] ?? TYPO_TO_DISPLAY[norm.replace(/e$/, '')];
  if (typoMatch) all.add(typoMatch);

  for (const { display, terms } of CATEGORY_SUGGESTIONS) {
    for (const t of terms) {
      const tNorm = stripDiacritics(t.toLowerCase());
      if (
        tNorm.includes(normNoDiac) || normNoDiac.includes(tNorm) || tNorm.startsWith(normNoDiac) || normNoDiac.startsWith(tNorm.slice(0, 3))
      ) {
        all.add(display);
        break;
      }
    }
  }
  const arr = Array.from(all);
  const categories = arr.filter((d) => MAIN_CATEGORIES.has(d)).slice(0, 5);
  const subcategories = arr.filter((d) => !MAIN_CATEGORIES.has(d)).slice(0, 5);

  const hasSubcategoryIndicator = SUBCATEGORY_INDICATOR_TERMS.has(normNoDiac) ||
    normNoDiac.split(/\s+/).some((tok) => SUBCATEGORY_INDICATOR_TERMS.has(tok));
  let isMainCategoryOnly = false;
  if (!hasSubcategoryIndicator) {
    for (const [mainDisplay, terms] of Object.entries(MAIN_CATEGORY_STRICT_TERMS)) {
      const matchMain = terms.some((t) => normNoDiac === t || normNoDiac.startsWith(t + ' ') || normNoDiac.endsWith(' ' + t));
      if (!matchMain) continue;
      const okSubs = subcategories.length === 0 || (subcategories.length === 1 && subcategories[0] === mainDisplay);
      const okCats = categories.includes(mainDisplay) || subcategories.includes(mainDisplay);
      if (okSubs && okCats) {
        isMainCategoryOnly = true;
        break;
      }
    }
  }
  return { categories, subcategories, isMainCategoryOnly };
}

/** Sugestii brand + categorie: "bm" -> Toate produsele BMW + Autovehicule. Fiecare are display și q pentru navigare. */
function getBrandSuggestions(lowerQuery: string): Array<{ display: string; q: string }> {
  const out: Array<{ display: string; q: string }> = [];
  const brands = getBrandsByPrefix(lowerQuery);
  const seenCategories = new Set<string>();
  for (const b of brands) {
    out.push({ display: `Toate produsele ${b.fullBrand}`, q: b.fullBrand });
    const catLabel = BRAND_CATEGORY_TO_DISPLAY[b.category || ''] || b.category || '';
    if (catLabel && !seenCategories.has(catLabel)) {
      seenCategories.add(catLabel);
      out.push({ display: catLabel, q: catLabel });
    }
  }
  return out;
}

/** Progressive suggestions: normalize query, split tokens, separate alpha vs numeric */
function normalizeQueryForProgressive(q: string): {
  raw: string;
  normalized: string;
  tokens: string[];
  alphaTokens: string[];
  numericTokens: string[];
  hasDigits: boolean;
  length: number;
} {
  const raw = (q || '').trim();
  const normalized = stripDiacritics(raw.toLowerCase()).replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const alphaTokens = tokens.filter((t) => /^\p{L}+$/u.test(t));
  const numericTokens = tokens.filter((t) => /\d/.test(t));
  const hasDigits = numericTokens.length > 0;
  return { raw, normalized, tokens, alphaTokens, numericTokens, hasDigits, length: normalized.length };
}

/** Count digits in string */
function digitCount(s: string): number {
  return (s.match(/\d/g) || []).length;
}

/** Extract numeric tokens from text (tokens that contain digits) */
function numericTokenCount(text: string): number {
  const norm = stripDiacritics((text || '').toLowerCase());
  const tokens = norm.split(/\s+/).filter(Boolean);
  return tokens.filter((t) => /\d/.test(t)).length;
}

/** Progressive scoring for product suggestions. Returns { score, reason } for debug. */
function scoreProductSuggestion(
  text: string,
  qNorm: string,
  qAlphaTokens: string[],
  qNumericTokens: string[],
  qLen: number,
  qHasDigits: boolean,
  brand?: string
): { score: number; reason: string } {
  const lower = text.toLowerCase();
  const normText = stripDiacritics(lower);
  let score = 0;
  const reasons: string[] = [];

  // +100: prefix match on first alpha token (e.g. q="jagu" vs "jaguar …")
  if (qAlphaTokens.length >= 1) {
    const first = qAlphaTokens[0];
    const words = normText.split(/\s+/);
    for (const w of words) {
      if (w.startsWith(first) || first.startsWith(w)) {
        score += 100;
        reasons.push('prefix first token');
        break;
      }
    }
  }

  // +60: prefix match for subsequent alpha tokens
  for (let i = 1; i < qAlphaTokens.length; i++) {
    const tok = qAlphaTokens[i];
    const words = normText.split(/\s+/);
    for (const w of words) {
      if (w.startsWith(tok) || tok.startsWith(w)) {
        score += 60;
        reasons.push('prefix subsequent token');
        break;
      }
    }
  }

  // +30: contains match for tokens
  for (const tok of qAlphaTokens) {
    if (normText.includes(tok)) score += 30;
  }

  // -40: penalty if suggestion has many digits when q has no digits (e.g. "3996" when q="jagu")
  const textDigits = digitCount(text);
  if (!qHasDigits && textDigits > 2) {
    score -= 40;
    reasons.push('numeric penalty');
  }

  // -25: penalty if suggestion too long (>45 chars) when q.length < 6
  if (qLen < 6 && text.length > 45) {
    score -= 25;
    reasons.push('length penalty');
  }

  // +20: bonus if match on brand field when q is prefix of brand
  if (brand && qAlphaTokens.length >= 1) {
    const brandNorm = stripDiacritics(brand.toLowerCase());
    if (brandNorm.startsWith(qAlphaTokens[0]) || qAlphaTokens[0].startsWith(brandNorm.slice(0, 4))) {
      score += 20;
      reasons.push('brand prefix bonus');
    }
  }

  return { score, reason: reasons[0] || 'base' };
}

/** Hyper-specific = (>=2 numeric tokens) OR (very long title + digits) */
function isHyperSpecific(text: string): boolean {
  return false; // Disabled to allow all types of products
}

/** Dedupe by normalized title (case-insensitive) */
function dedupeByNormalizedTitle<T extends { display?: string; title?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = stripDiacritics((item.display || item.title || '').toLowerCase().trim());
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const rid = randomUUID();
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const rawQ = searchParams.get('q') ?? '';
  const query = rawQ.trim();
  const limitParam = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Number(searchParams.get('limit')) || 10));
  const limit = Number.isNaN(limitParam) ? 10 : limitParam;

  const { allowed: rateLimitAllowed } = checkSuggestRateLimit(request);
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: 'Too many requests', suggestions: [], products: [] },
      { status: 429, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const authHeader = request.headers.get('authorization');
    const lang = searchParams.get('lang') || 'ro';

    // When q missing or < 2 chars: return trending (popular) only
    if (!query || query.length < 2) {
      let popular: Array<{ display: string; q: string; categorySlug?: string; subcategorySlug?: string }> = [];
      if (supabaseAdmin) {
        try {
          const { data: rows } = await supabaseAdmin
            .from('search_popular_suggestions')
            .select('label, q, category_slug, subcategory_slug')
            .eq('lang', lang)
            .eq('active', true)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(24);
          popular = (rows || []).map((r: { label?: string; q?: string; category_slug?: string; subcategory_slug?: string }) => ({
            display: r.label ?? r.q ?? '',
            q: r.q ?? r.label ?? '',
            categorySlug: r.category_slug ?? undefined,
            subcategorySlug: r.subcategory_slug ?? undefined,
          }));
        } catch {
          /* fallback to empty popular */
        }
      }
      if (popular.length === 0) {
        popular = FALLBACK_TRENDING.map((label) => ({ display: label, q: label }));
      }
      const elapsed = Date.now() - startTime;
      console.info(JSON.stringify({ rid, q: '', limit, count: popular.length, elapsed_ms: elapsed }));
      return NextResponse.json(
        {
          subcategories: [],
          suggestions: popular,
          products: [],
          meta: { expandedLocation: false, expandedCategory: false, termsReduced: false },
          used: { tokens: [] as string[], categorySlug: undefined as string | undefined, locationMode: 'all' as const },
        },
        { headers: { 'Cache-Control': SUGGEST_CACHE_CONTROL, 'X-Request-Id': rid } }
      );
    }

    // DB-backed suggestions first (search_suggestions + synonyms via RPC)
    let dbSuggestions: Array<{ display: string; q: string }> = [];
    try {
      const admin = createAdminClient();
      const qNorm = normalizeRo(query);
      if (qNorm) {
        const { data: rpcRows, error: rpcError } = await admin.rpc('search_suggestions_rpc', {
          q_norm: qNorm,
          kind_filter: null,
          lim: limit,
          category: null,
          subcategory: null,
          county: null,
          city: null,
        });
        if (!rpcError && Array.isArray(rpcRows)) {
          dbSuggestions = (rpcRows as { phrase: string }[]).map((r) => ({
            display: r.phrase,
            q: r.phrase,
          }));
        }
      }
    } catch {
      /* non-fatal: continue with brands/categories/products */
    }

    // Normalizare imediată: lowercase + fără diacritice, ca sugestiile să funcționeze indiferent cum tastează userul (BARA, Bară etc.)
    let normalizedInput = (query || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    // Toleranță la dublarea literelor: barra → bara, barrra → bara
    normalizedInput = normalizedInput.replace(/(.)\1+/g, '$1');
    const optimized = optimizeQuery(normalizedInput);
    const lowerQuery = (optimized.corrected || normalizedInput).trim();
    const qNorm = normalizeQueryForProgressive(lowerQuery);
    const { tokens: qTokens, alphaTokens: qAlphaTokens, numericTokens: qNumericTokens, hasDigits: qHasDigits, length: qLen } = qNorm;
    const DEBUG = !!process.env.DEBUG_SUGGESTIONS;

    try {

      // 0) Categorii și subcategorii REALE din produse (doar ce există în DB)
      let realCategorySet = new Set<string>();
      let realSubcategorySet = new Set<string>();
      if (supabaseAdmin) {
        try {
          const { data: facets } = await supabaseAdmin
            .from('products')
            .select('category, subcategory')
            .neq('status', 'deleted')
            .or('status.eq.active,approval_status.eq.approved')
            .not('title', 'is', null);
          (facets || []).forEach((r: { category?: string; subcategory?: string }) => {
            if (r.category && String(r.category).trim()) realCategorySet.add(String(r.category).trim());
            if (r.subcategory && String(r.subcategory).trim()) realSubcategorySet.add(String(r.subcategory).trim());
          });
        } catch (err) {
          console.warn('Real facets fetch error:', err);
        }
      }
      const matchesReal = (display: string, set: Set<string>): boolean => {
        if (!display || set.size === 0) return true;
        const d = display.trim().toLowerCase();
        for (const r of set) {
          const rl = r.toLowerCase();
          if (rl === d || rl.includes(d) || d.includes(rl)) return true;
        }
        return false;
      };

      /** Pentru subcategorii: verifică și slug-ul (ex. "Case și Vile" → "case-vile") ca DB are slug-uri */
      const matchesRealSubcategory = (display: string): boolean => {
        if (!display) return true;
        const slug = SUBDISPLAY_TO_SLUG[display];
        if (slug && (realSubcategorySet.has(slug) || realCategorySet.has(slug))) return true;
        return matchesReal(display, realSubcategorySet) || matchesReal(display, realCategorySet);
      };

      // 1) Branduri, categorii, subcategorii – ordine: BRANDURI → CATEGORII → SUBCATEGORII → PRODUSE (doar categorii reale)
      const cityDetected = detectCityInQuery(lowerQuery);
      const queryForCategories = cityDetected ? cityDetected.baseQuery : lowerQuery;
      const brandSuggestions = getBrandSuggestions(queryForCategories);
      const { categories: rawCategories, subcategories: rawSubcategories, isMainCategoryOnly } = getCategoriesAndSubcategories(queryForCategories);
      const categories = rawCategories.filter((c) => matchesReal(c, realCategorySet));
      const subcategories = rawSubcategories.filter(matchesRealSubcategory);

      // 2) Istoric (doar dacă potrivește primele 2 caractere)
      let searchHistory: string[] = [];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const historyResponse = await fetch(`${request.nextUrl.origin}/api/search/history`, {
            headers: { 'Authorization': authHeader },
          });
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            searchHistory = (historyData.history || [])
              .map((item: any) => item.query)
              .filter((q: string) => q && q.toLowerCase().includes(lowerQuery.substring(0, 2)))
              .slice(0, 3);
          }
        } catch (err) {
          /* ignore */
        }
      }

      // 3) Sugestii extrase din titlurile produselor (progressive: gating + scoring)
      type SubcategoryItem = { display: string; q: string; brand?: string; category?: string; subcategory?: string; categorySlug?: string; subcategorySlug?: string };
      let productTitleSuggestions: SubcategoryItem[] = [];
      // Gating: q.length < 3 → no product suggestions (only brand/category/subcategory)
      if (supabaseAdmin && qLen >= 3) {
        try {
          const searchTerms = [...new Set([lowerQuery, ...(/^ip/.test(lowerQuery) ? ['iphone', 'ipod'] : [])])];
          const orClause = searchTerms.flatMap(t => [`title.ilike.%${t}%`, `description.ilike.%${t}%`, `category.ilike.%${t}%`, `subcategory.ilike.%${t}%`]).join(',');
          const { data: products } = await supabaseAdmin
            .from('products')
            .select('id, title, category, subcategory')
            .or(orClause)
            .not('title', 'is', null)
            .limit(50);

          if (products && products.length > 0) {
            const seen = new Set<string>();
            const raw: SubcategoryItem[] = [];
            for (const p of products) {
              const extracted = extractSuggestionsFromTitle((p as any).title);
              const cat = (p as any).category || '';
              const subcat = (p as any).subcategory || '';
              for (const s of extracted) {
                if (s.length >= 3 && s.toLowerCase().includes(lowerQuery) && !seen.has(s)) {
                  seen.add(s);
                  const analysis = analyzeQuery(s);
                  const brandDisplay = analysis.brand?.fullBrand;
                  const inferredCat = inferCategoryFromSuggestionText(s);
                  const useSubcat = inferredCat ? undefined : subcat;
                  raw.push({
                    display: s,
                    q: s,
                    brand: brandDisplay,
                    category: inferredCat || cat || analysis.category,
                    subcategory: useSubcat,
                  });
                }
              }
            }
            // Progressive scoring + gating for 3 <= q.length < 5
            const scored = raw.map((item) => {
              const { score, reason } = scoreProductSuggestion(item.display, lowerQuery, qAlphaTokens, qNumericTokens, qLen, qHasDigits, item.brand);
              return { item, score, reason };
            });
            let filtered = scored;
            if (qLen >= 3 && qLen < 5) {
              filtered = scored.filter(({ item, score }) => {
                const digits = digitCount(item.display);
                const noNumericNoise = qHasDigits || (digits <= 2);
                const strongPrefix = score >= 80;
                return strongPrefix && noNumericNoise;
              });
            }
            filtered.sort((a, b) => b.score - a.score);
            // Diversity: max 2 hyper-specific in product title suggestions
            const diverse: SubcategoryItem[] = [];
            let hyperCount = 0;
            for (const { item } of filtered) {
              if (isHyperSpecific(item.display) && hyperCount >= 2) continue;
              if (isHyperSpecific(item.display)) hyperCount++;
              diverse.push(item);
              if (diverse.length >= 15) break;
            }
            productTitleSuggestions = dedupeByNormalizedTitle(diverse);
            if (/^ip(hone|od|ad)?$/.test(lowerQuery) && !productTitleSuggestions.some(p => p.display.toLowerCase() === 'iphone')) {
              const hasIphone = productTitleSuggestions.some(p => p.display.toLowerCase().includes('iphone'));
              if (hasIphone) {
                productTitleSuggestions.unshift({
                  display: 'iphone',
                  q: 'iphone',
                  brand: 'Apple',
                  category: 'Electronice',
                });
                productTitleSuggestions = productTitleSuggestions.slice(0, 15);
              }
            }
            if (DEBUG) {
              // eslint-disable-next-line no-console
              console.debug('[suggestions] productTitleSuggestions top 10', {
                q: lowerQuery,
                tokens: qTokens,
                top: filtered.slice(0, 10).map(({ item, score, reason }) => ({ display: item.display.slice(0, 50), score, reason })),
              });
            }
          }
        } catch (err) {
          console.warn('Product title suggestions error:', err);
        }
      }

      // 4) Doar categorii și subcategorii reale (din produse) – fără smartSuggestions/keywords/related
      const subcategoriesExtended = [...subcategories].slice(0, 8);

      // Când user scrie DOAR categorie principală (Imobiliare, Autoturisme) – nu adăugăm titluri produse
      const productTitleFiltered = isMainCategoryOnly ? [] : productTitleSuggestions;

      // Listă sugestii: DB-backed first, then branduri + categorii + titluri produse + subcategorii (fără duplicate)
      const productDisplaySet = new Set(productTitleFiltered.map(p => p.display.toLowerCase()));
      const subcategoriesNoDupes = subcategoriesExtended
        .map(s => (typeof s === 'string' ? s : (s as { display: string }).display))
        .filter(s => !productDisplaySet.has(s.toLowerCase()));
      const seenQ = new Set<string>();
      const dedupe = (item: string | { display: string; q: string }) => {
        const q = typeof item === 'string' ? item : item.q;
        const key = q.trim().toLowerCase();
        if (seenQ.has(key)) return false;
        seenQ.add(key);
        return true;
      };
      let restSuggestions: Array<string | { display: string; q: string }> = [
        ...brandSuggestions,
        ...categories.map((c) => ({ display: c, q: c })),
        ...productTitleFiltered,
        ...subcategoriesNoDupes.map((s) => ({ display: s, q: s })),
      ].filter(dedupe);

      // Când user scrie și oraș – adăugăm sugestii "Termen Oraș" (ex: Apartamente București, usa audi Craiova)
      if (cityDetected) {
        const city = cityDetected.city;
        const citySuggestions: Array<{ display: string; q: string }> = [
          ...categories.map((c) => ({ display: `${c} ${city}`, q: `${c} ${city}` })),
          ...subcategoriesNoDupes.map((s) => ({ display: `${s} ${city}`, q: `${s} ${city}` })),
          ...productTitleFiltered.slice(0, 4).map((p) => ({
            display: `${(p as SubcategoryItem).display} ${city}`,
            q: `${(p as SubcategoryItem).q} ${city}`,
          })),
        ].filter((item) => dedupe(item));
        restSuggestions = [...citySuggestions, ...restSuggestions];
      }

      const suggestions: Array<string | { display: string; q: string }> = [
        ...dbSuggestions.filter((s) => dedupe(s)),
        ...restSuggestions,
      ].slice(0, 25);

      // 5) Produse (obiecte) – progressive gating + scoring
      let productSuggestions: Array<{
        id: string;
        title: string;
        image?: string;
        price?: number;
        category?: string;
        url?: string;
      }> = [];

      if (supabaseAdmin && qLen >= 2) {
        try {
          const { data: products } = await supabaseAdmin
            .from('products')
            .select('id, title, images, starting_price_ron, category, subcategory, url, slug, brand, product_type')
            .or(`title.ilike.%${lowerQuery}%,description.ilike.%${lowerQuery}%,category.ilike.%${lowerQuery}%,subcategory.ilike.%${lowerQuery}%`)
            .not('title', 'is', null)
            .limit(30);

          if (products && products.length > 0) {
            const uniqueProducts = Array.from(new Map(products.map((p: any) => [p.id, p])).values());
            const withScore = uniqueProducts.map((p: any) => {
              const title = p.title || '';
              const brand = p.brand || p.category;
              const { score, reason } = scoreProductSuggestion(title, lowerQuery, qAlphaTokens, qNumericTokens, qLen, qHasDigits, brand);
              return { p, score, reason };
            });
            let filtered = withScore;
            if (qLen >= 2 && qLen < 5) {
              filtered = withScore.filter(({ p, score }) => {
                const strongPrefix = score >= 60;
                return strongPrefix;
              });
            }
            filtered.sort((a, b) => b.score - a.score);
            // Diversity: max 2 hyper-specific in top 8
            const top = filtered.slice(0, 12);
            const result: typeof withScore = [];
            let hyperCount = 0;
            for (const x of top) {
              if (isHyperSpecific(x.p.title || '') && hyperCount >= 2) continue;
              if (isHyperSpecific(x.p.title || '')) hyperCount++;
              result.push(x);
              if (result.length >= 8) break;
            }
            const mapped = result.slice(0, 8).map(({ p }) => {
              const imageUrl = Array.isArray(p.images) && p.images.length > 0
                ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.url)
                : undefined;
              const productTypeRoutes: Record<string, string> = {
                'licitatii-publice': 'licitatii-publice',
                'live-bid': 'live_bid',
                'buy-now': 'produs',
              };
              const route = productTypeRoutes[p.product_type || 'live-bid'] || 'produse';
              const url = p.url || (p.slug ? `/${route}/${p.slug}` : `/${route}/${p.id}`);
              return {
                id: p.id,
                title: p.title,
                image: imageUrl,
                price: p.starting_price_ron,
                category: p.category || p.subcategory,
                url: url,
              };
            });
            productSuggestions = dedupeByNormalizedTitle(mapped).slice(0, 5);
            if (DEBUG) {
              // eslint-disable-next-line no-console
              console.debug('[suggestions] products top 10', {
                q: lowerQuery,
                tokens: qTokens,
                top: result.slice(0, 10).map(({ p, score, reason }) => ({ title: (p.title || '').slice(0, 50), score, reason })),
              });
            }
          }
        } catch (error) {
          console.warn('Supabase suggestions error:', error);
        }
      }

      // Subcategorii: MAI ÎNTÂI categorii și subcategorii (activează corect filtrele), apoi sugestii din titluri
      const classicItems: SubcategoryItem[] = subcategoriesExtended
        .map(s => (typeof s === 'string' ? s : (s as any).display))
        .filter(d => d && !productDisplaySet.has(d.toLowerCase()))
        .map(display => {
          const analysis = analyzeQuery(display);
          const inferredCat = inferCategoryFromSuggestionText(display);
          return {
            display,
            q: display,
            brand: analysis.brand?.fullBrand,
            category: inferredCat || analysis.category,
          };
        });
      // Subcategorie -> categorie părinte (pentru subtitle corect: "Case și Vile" -> Imobiliare)
      const SUBCATEGORY_TO_CATEGORY: Record<string, string> = {
        'Apartamente': 'Imobiliare',
        'Case și Vile': 'Imobiliare',
        'Terenuri': 'Imobiliare',
        'Spații Comerciale': 'Imobiliare',
        'Autoturisme': 'Autovehicule',
        'Piese auto': 'Autovehicule',
        'Telefoane': 'Electronice & Tehnologie',
        'Laptopuri': 'Electronice & Tehnologie',
        'Modă & Lifestyle': 'Modă & Lifestyle',
        'Utilaje & Echipamente': 'Utilaje & Echipamente',
        'Artă & Antichități': 'Artă & Antichități',
        'Mama și copilul': 'Mama și copilul',
        'Bijuterii': 'Bijuterii',
        'Mobilier': 'Mobilier',
        'Executări': 'Executări',
      };
      const categoryItems: SubcategoryItem[] = categories
        .filter(c => !productDisplaySet.has(c.toLowerCase()) && (realCategorySet.size === 0 || matchesReal(c, realCategorySet)))
        .map(display => ({
          display,
          q: display,
          brand: undefined,
          category: SUBCATEGORY_TO_CATEGORY[display] || display,
        }));
      const classicItemsFiltered = classicItems.filter(
        item => realSubcategorySet.size === 0 || matchesReal(item.display, realSubcategorySet) || matchesReal(item.display, realCategorySet)
      );
      let subcategoriesForResponse: SubcategoryItem[] = [
        ...categoryItems,
        ...classicItemsFiltered,
        ...productTitleFiltered,
      ];
      if (cityDetected) {
        const city = cityDetected.city;
        const cityExtras: SubcategoryItem[] = [
          ...categories.map((c) => ({
            display: `${c} ${city}`,
            q: `${c} ${city}`,
            category: SUBCATEGORY_TO_CATEGORY[c] || c,
          })),
          ...subcategoriesNoDupes.map((s) => ({
            display: `${s} ${city}`,
            q: `${s} ${city}`,
            category: SUBCATEGORY_TO_CATEGORY[s] || undefined,
          })),
        ];
        subcategoriesForResponse = [...cityExtras, ...subcategoriesForResponse];
      }
      // Strict mode: keep only real suggestions from DB/title extraction (no artificial padding)
      subcategoriesForResponse = subcategoriesForResponse.slice(0, 25);

      const { inferIntentCategoriesFromQuery, getSlugsForDisplay } = await import('@/lib/search/categoryRules');
      subcategoriesForResponse = subcategoriesForResponse.map((item) => {
        const slugs = getSlugsForDisplay(item.display, item.category, item.subcategory);
        return { ...item, categorySlug: slugs.categorySlug, subcategorySlug: slugs.subcategorySlug };
      });

      const { tokenize: tokenizeQuery } = await import('@/lib/search/normalize');
      const intentCategories = inferIntentCategoriesFromQuery(lowerQuery);
      const usedCategorySlug = intentCategories[0]?.categorySlug;
      const usedSubcategorySlug = intentCategories[0]?.subcategorySlug;

      const finalSuggestions = suggestions.length > 0 ? suggestions : getFallbackSuggestions(query);
      let outSuggestions: Array<string | { display: string; q: string }>;
      if (Array.isArray(finalSuggestions) && finalSuggestions.length > 0) {
        outSuggestions = typeof finalSuggestions[0] === 'string'
          ? (finalSuggestions as string[]).map((s) => ({ display: s, q: s }))
          : (finalSuggestions as Array<{ display: string; q: string }>);
      } else {
        outSuggestions = FALLBACK_TRENDING.map((label) => ({ display: label, q: label }));
      }

      const elapsed = Date.now() - startTime;
      console.info(JSON.stringify({ rid, q: query.slice(0, 50), limit, count: outSuggestions.length, elapsed_ms: elapsed }));

      return NextResponse.json(
        {
          brands: brandSuggestions,
          categories: categories.map((c) => ({ display: c, q: c })),
          subcategories: subcategoriesForResponse,
          products: productSuggestions,
          suggestions: outSuggestions,
          corrected: optimized.corrected !== query ? optimized.corrected : undefined,
          time: elapsed,
          meta: {
            expandedLocation: false,
            expandedCategory: false,
            termsReduced: false,
            count: outSuggestions.length,
          },
          used: {
            tokens: tokenizeQuery(lowerQuery),
            categorySlug: usedCategorySlug,
            subcategorySlug: usedSubcategorySlug,
            locationMode: 'all' as const,
          },
        },
        {
          headers: {
            'Cache-Control': SUGGEST_CACHE_CONTROL,
            'X-Request-Id': rid,
          },
        }
      );
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const fallback = FALLBACK_TRENDING.map((label) => ({ display: label, q: label }));
      console.warn(JSON.stringify({ rid, q: query.slice(0, 50), error: 'inner_catch', elapsed_ms: elapsed }));
      return NextResponse.json(
        {
          suggestions: fallback,
          products: [],
          subcategories: [],
          time: elapsed,
        },
        { headers: { 'Cache-Control': SUGGEST_CACHE_CONTROL, 'X-Request-Id': rid } }
      );
    }
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ rid, q: rawQ.slice(0, 50), error: msg, elapsed_ms: elapsed }));
    return NextResponse.json(
      {
        suggestions: FALLBACK_TRENDING.map((label) => ({ display: label, q: label })),
        products: [],
        error: msg,
      },
      { status: 200, headers: { 'Cache-Control': SUGGEST_CACHE_CONTROL, 'X-Request-Id': rid } }
    );
  }
}

/** Fallback când API-ul eșuează – tot categorii, min 2 caractere */
function getFallbackSuggestions(query: string): string[] {
  const q = (query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  return getCategorySuggestions(q).slice(0, 5);
}

/**
 * Cuvinte de ignorat la extragerea sugestiilor din titluri
 */
const STOP_WORDS = new Set([
  'vand', 'vând', 'vandut', 'vândut', 'cumpar', 'cumpăr', 'ofer', 'oferta', 'ofertă',
  'anunt', 'anunț', 'licitatie', 'licitație', 'de', 'pe', 'la', 'cu', 'si', 'și', 'sau',
  'pentru', 'din', 'in', 'în', 'un', 'o', 'a', 'al', 'ale', 'baterie', 'baterii',
  'procent', 'stare', 'nou', 'noua', 'folosit', 'second', 'hand', 'deconalt', 'deconectat',
  'vanzare', 'vânzare', 'cumpar', 'cumpăr'
]);

/** Piese auto – extragere precisă din titluri (Set pentru lookup rapid) */
const AUTO_PIECES = new Set(PIESE_AUTO_TERMS);

/** Abreviere branduri auto – ignorate la sugestie (vw, bmw) */
const AUTO_BRAND_ABBREV = new Set(['vw', 'bmw', 'vwv', 'skoda']);

/** Culori comune pentru sugestii combinate */
const COLORS = new Set([
  'negru', 'alb', 'gri', 'rosu', 'roșu', 'albastru', 'verde', 'galben', 'portocaliu',
  'auriu', 'argintiu', 'maro', 'bej', 'crem', 'roz', 'blue', 'bleumarin', 'turcoaz'
]);

/**
 * Extrage sugestii de căutare din titlul unui produs.
 * Ex: "vand iphone 12 deconalt negru 87% baterie" → ["iphone 12 negru", "iphone 12"]
 * Ex: "aripa de vanzare pentru vw golf 5" → ["aripa golf 5"]
 */
function extractSuggestionsFromTitle(title: string): string[] {
  if (!title || typeof title !== 'string') return [];
  const suggestions: string[] = [];
  const lower = title.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = lower.split(' ').filter(w => w.length >= 1);

  // Piese auto: piesă + model (aripa golf 5, capota passat)
  const pieceIdx = words.findIndex(w => AUTO_PIECES.has(w));
  if (pieceIdx >= 0) {
    const piece = words[pieceIdx];
    const rest = words
      .filter((_, i) => i !== pieceIdx)
      .filter(w => !STOP_WORDS.has(w) && !AUTO_BRAND_ABBREV.has(w) && (w.length > 1 || /^\d+$/.test(w)))
      .slice(0, 3);
    const modelPart = rest.join(' ');
    if (modelPart.length >= 2) {
      suggestions.push(`${piece} ${modelPart}`.trim());
    }
    suggestions.push(piece);
  }

  const foundColors = words.filter(w => COLORS.has(w));
  const relevant = words
    .filter(w => !STOP_WORDS.has(w) && !COLORS.has(w) && !AUTO_BRAND_ABBREV.has(w))
    .filter(w => w.length > 1 || /^\d+$/.test(w))
    .slice(0, 4);
  const base = relevant.join(' ');

  if (base.length >= 3) {
    if (!suggestions.includes(base)) suggestions.push(base);
    for (const color of foundColors.slice(0, 2)) {
      const combo = `${base} ${color}`;
      if (!suggestions.includes(combo)) suggestions.push(combo);
    }
  }
  return [...new Set(suggestions)];
}

/**
 * Generează sugestii înrudite când sunt puține rezultate.
 * Ex: "iphone 12" → ["iphone 13", "iphone 14", "iphone 15", "iphone 11", "iphone 7"]
 */
function getRelatedSuggestions(query: string, limit = 8): string[] {
  const q = (query || '').toLowerCase().trim();
  const out: string[] = [];
  const match = q.match(/^(.+?)\s*(\d+)\s*$/);
  if (!match) return out;
  const [, base, numStr] = match;
  const num = parseInt(numStr, 10);
  if (isNaN(num) || num < 1 || num > 99) return out;

  const candidates: number[] = [];
  for (let i = num + 1; i <= Math.min(num + 5, 99); i++) candidates.push(i);
  for (let i = num - 1; i >= Math.max(num - 3, 1); i--) candidates.push(i);
  candidates.push(7, 8, 9, 10, 11, 12, 13, 14, 15);

  const seen = new Set<string>();
  for (const n of candidates) {
    const s = `${base}${base.endsWith(' ') ? '' : ' '}${n}`.trim();
    if (!seen.has(s) && s !== q) {
      seen.add(s);
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

/**
 * Sugestii bazate pe keywords comune
 */
function getKeywordSuggestions(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const suggestions: string[] = [];

  const keywordMap: Record<string, string[]> = {
    tel: ['Telefoane', 'Electronice & Tehnologie'],
    lap: ['Laptopuri', 'Electronice & Tehnologie'],
    bij: ['Bijuterii', 'Artă & Antichități'],
    cum: ['Cum funcționează licitațiile', 'Cum cumpăr tokens'],
    cump: ['Cumpăr telefoane', 'Cumpăr laptopuri'],
    token: ['Tokens', 'Cum cumpăr tokens'],
    licit: ['Licitații', 'Executări'],
    apa: ['Apartamente', 'Imobiliare'],
    aut: ['Autovehicule', 'Autoturisme'],
    exe: ['Executări'],
    imo: ['Imobiliare', 'Apartamente'],
  };

  for (const [keyword, variants] of Object.entries(keywordMap)) {
    if (lowerQuery.startsWith(keyword) || lowerQuery.includes(keyword)) {
      suggestions.push(...variants);
      break;
    }
  }
  return suggestions.slice(0, 4);
}

