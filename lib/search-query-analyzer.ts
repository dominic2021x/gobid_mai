/**
 * Analizează query-ul de căutare pentru /ro – inferă categorie, subcategorie, brand
 * și termeni înrudiți (ex: iPhone 14 → iPhone 13, 12, 15, 16)
 */

import { analyzeQuery } from '@/lib/ai/brand-detector';
import { CATEGORY_LEVEL_3 } from '@/lib/categories';
import { ROMANIAN_CITIES } from '@/lib/data/romanian-cities';
import { tipPiesaLabelToSlug } from '@/lib/piese-auto/tip-piesa-level3';
import {
  CATEGORY_DISPLAY,
  DISPLAY_TO_SLUGS,
  SIBLINGS_BY_CATEGORY,
} from '@/lib/search/categoryRules';

/** Mapare categorie din brand-detector la cheie /ro */
const CATEGORY_DISPLAY_TO_KEY: Record<string, string> = {
  'Electronice': 'electronice',
  'Electronice & Tehnologie': 'electronice',
  'Auto': 'autovehicule',
  'Autovehicule': 'autovehicule',
  'Imobiliare': 'imobiliare',
  'Executări Silite': 'executari',
  'Executări': 'executari',
  'Utilaje & Echipamente': 'utilaje',
  'Artă & Antichități': 'arta',
  'Modă & Lifestyle': 'moda',
  'Îmbrăcăminte': 'moda',
  'Încălțăminte': 'moda',
  'Bijuterii': 'arta',
  'Mobilier': 'casa',
  'Mobilier & Casă': 'casa',
  'Mama și copilul': 'mama-copil',
  'Agricultură & Zootehnie': 'agricultura',
  'Maritime & Aeronautice': 'maritime',
  'Business & Licitații': 'business',
  'Materiale Construcții': 'materiale',
  'Diverse / Speciale': 'diverse',
};

/** Mapare termeni din query la subcategorii per categorie (ordine: fraze specifice → termeni generali). */
const QUERY_TO_SUBCATEGORY: { terms: string[]; cat: string; sub: string }[] = [
  { terms: ['masina de spalat', 'masina spalat', 'masini de spalat', 'uscator rufe', 'uscător rufe', 'frigider', 'cuptor incorporabil', 'cuptor electric', 'aspirator', 'electrocasnice', 'masina de cusut'], cat: 'casa', sub: 'electrocasnice' },
  { terms: ['executari silite', 'executare silita', 'executări silite', 'insolventa', 'insolvență', 'licitatie silita', 'licitație silită', 'executor judecatoresc', 'licitatii executari', 'licitații executări'], cat: 'executari', sub: 'exec-imobiliare' },
  { terms: ['excavator', 'buldozer', 'macara', 'incarcator frontal', 'încărcător frontal', 'compresor industrial', 'demolator', 'betoniera'], cat: 'utilaje', sub: 'utilaje-constructii' },
  { terms: ['tractor agricol', 'combina agricola', 'combina agricolă', 'plug agricol', 'semanatoare', 'semănătoare', 'cositoare', 'remorca agricola'], cat: 'utilaje', sub: 'utilaje-agricole' },
  { terms: ['generator', 'generatoare', 'generatorul', 'ups', 'invertor', 'sudura', 'sudură', 'perforator'], cat: 'utilaje', sub: 'generatoare' },
  { terms: ['tablou', 'tablouri', 'pictura', 'pictură', 'sculptura', 'sculptură', 'antichitat', 'antichitate', 'licitatie arta', 'fotografie artistica'], cat: 'arta', sub: 'picturi' },
  { terms: ['rochie', 'pantofi', 'pantofi sport', 'geanta', 'geantă', 'haine designer', 'incaltaminte', 'încălțăminte', 'parfum', 'cosmetice'], cat: 'moda', sub: 'haine-designer' },
  { terms: ['jucarii', 'jucării', 'carucior', 'cărucior', 'bebelus', 'bebeluș', 'patut copil', 'pătuț copil', 'scaun auto copil'], cat: 'mama-copil', sub: 'jucarii' },
  { terms: ['seminte', 'sămânță', 'furaje', 'ingrasaminte', 'îngrășăminte', 'irigatii', 'irigații', 'animale vii', 'tractor ferma'], cat: 'agricultura', sub: 'tractoare-combine' },
  { terms: ['barca ', 'bărci', 'iaht', 'velier', 'skijet', 'motor barca', 'motoare marine'], cat: 'maritime', sub: 'barci-iahturi' },
  { terms: ['lichidare firma', 'lichidare firmă', 'stocuri firma', 'mobilier birou second', 'echipamente birou'], cat: 'business', sub: 'lichidari-firme' },
  { terms: ['ciment ', 'caramida', 'cărămidă', 'otel constructii', 'oțel construcții', 'izolatie', 'izolație', 'polistiren', 'vata minerala'], cat: 'materiale', sub: 'ciment-caramida' },
  { terms: ['nft ', 'militaria', 'militărie', 'colectie militara'], cat: 'diverse', sub: 'militare-istorice' },
  { terms: ['canapea', 'dulap ', 'pat ', 'birou ', 'saltea', 'mobilier interior', 'decoratiuni', 'decoratiuni '], cat: 'casa', sub: 'mobilier-interior' },
  { terms: ['iphone', 'iphone 14', 'iphone 13', 'samsung', 'xiaomi', 'huawei', 'telefon', 'smartphone', 'telefoane'], cat: 'electronice', sub: 'telefoane' },
  { terms: ['laptop', 'laptopuri', 'pc', 'dell', 'hp', 'lenovo', 'asus'], cat: 'electronice', sub: 'laptopuri-pc' },
  { terms: ['tablet', 'ipad', 'tablete'], cat: 'electronice', sub: 'tablete' },
  { terms: ['tv', 'televizor', 'audio', 'soundbar'], cat: 'electronice', sub: 'tv-audio' },
  { terms: ['playstation', 'xbox', 'nintendo', 'consola '], cat: 'electronice', sub: 'console-jocuri' },
  { terms: ['drone ', 'drona ', 'action cam', 'gopro'], cat: 'electronice', sub: 'drone-gadgeturi' },
  /** Înainte de branduri scurte (bmw, audi): termeni de piese băteau altfel „baterie bmw” → autoturisme. */
  { terms: ['piese auto', 'piese-auto', 'piesa auto', 'aripa', 'capota', 'capotă', 'far', 'fari', 'bara', 'bari', 'janta', 'jante', 'amortizor', 'cutie viteze', 'cutie-viteze', 'transmisie', 'alternator', 'turbo', 'turbina', 'turbină', 'distributie', 'bujii', 'filtru', 'cardan', 'etrier', 'placute', 'parbriz', 'oglinda', 'geam auto', 'baterie', 'baterii', 'acumulator', 'acumulatori'], cat: 'autovehicule', sub: 'piese-auto' },
  { terms: ['masina', 'masini', 'autoturism', 'bmw', 'mercedes', 'audi', 'dacia', 'ford'], cat: 'autovehicule', sub: 'autoturisme' },
  { terms: ['motocicleta', 'motociclete', 'scuter', 'atv '], cat: 'autovehicule', sub: 'motociclete' },
  { terms: ['apartament', 'apartamente'], cat: 'imobiliare', sub: 'apartamente' },
  { terms: ['casa', 'vila', 'case', 'vile', 'case si vile', 'case și vile', 'case-si-vile'], cat: 'imobiliare', sub: 'case-vile' },
  { terms: ['teren', 'terenuri'], cat: 'imobiliare', sub: 'terenuri-intravilane' },
  { terms: ['spatiu comercial', 'spațiu comercial', 'spatii comerciale', 'showroom', 'hala industriala'], cat: 'imobiliare', sub: 'spatii-comerciale' },
];

function normToken(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Potriviri din lexiconul de afișare + denumiri categorii /ro (pentru query-uri care nu sunt în lista de mai sus).
 */
function matchQueryToDisplayLexicon(lower: string): { cat: string; sub: string } | null {
  const ln = normToken(lower);

  const entries = Object.entries(DISPLAY_TO_SLUGS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of entries) {
    const nk = normToken(key);
    if (nk.length < 4) {
      if (new RegExp(`(^|[\\s,;])${escapeRegExp(nk)}([\\s,;]|$)`, 'i').test(ln)) {
        return { cat: val.categorySlug, sub: val.subcategorySlug };
      }
    } else if (ln.includes(nk)) {
      return { cat: val.categorySlug, sub: val.subcategorySlug };
    }
  }

  for (const [slug, display] of Object.entries(CATEGORY_DISPLAY)) {
    if (slug === 'all') continue;
    const nd = normToken(display);
    if (nd.length < 5) continue;
    if (ln.includes(nd)) {
      const firstSub = SIBLINGS_BY_CATEGORY[slug]?.[0];
      if (firstSub) return { cat: slug, sub: firstSub };
    }
  }

  for (const slug of Object.keys(SIBLINGS_BY_CATEGORY)) {
    if (slug === 'all') continue;
    const phrase = normToken(slug.replace(/-/g, ' '));
    if (phrase.length < 8) continue;
    if (ln.includes(phrase)) {
      const firstSub = SIBLINGS_BY_CATEGORY[slug][0];
      return { cat: slug, sub: firstSub };
    }
  }

  return null;
}

/** Level 3 pentru telefoane – mapare brand/term la key */
const PHONE_BRAND_TO_LEVEL3: Record<string, string> = {
  'iphone': 'iphone', 'apple': 'iphone',
  'samsung': 'samsung', 'xiaomi': 'xiaomi', 'huawei': 'huawei',
  'oppo': 'oppo', 'oneplus': 'oneplus', 'google': 'google-pixel',
  'pixel': 'google-pixel', 'nokia': 'nokia', 'motorola': 'motorola',
};

export interface SearchAnalysis {
  categoryKey: string;
  subcategoryKey: string;
  brand: string;
  level3: string;
  location: string;
  /** Query-ul utilizatorului care ar putea fi un model (ex: "iPhone 14", "Seria 3") – pentru sugestii modele apropiate */
  modelQuery: string;
  primaryTerm: string;
  relatedTerms: string[];
  allSearchTerms: string[];
}

/**
 * Generează termeni înrudiți pentru căutare extinsă.
 * Ex: "iphone 14" → ["iphone 14", "iphone 15", "iphone 13", "iphone 16", "iphone 12", ...]
 */
export function getRelatedSearchTerms(query: string, limit = 12): string[] {
  const q = (query || '').toLowerCase().trim();
  const out: string[] = [q];
  const match = q.match(/^(.+?)\s+(\d+)\s*$/);
  if (!match) return out;
  const [, base, numStr] = match;
  const num = parseInt(numStr, 10);
  if (isNaN(num) || num < 1 || num > 99) return out;

  const candidates: number[] = [];
  for (let i = num + 1; i <= Math.min(num + 5, 99); i++) candidates.push(i);
  for (let i = num - 1; i >= Math.max(num - 3, 1); i--) candidates.push(i);
  candidates.push(7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

  const seen = new Set<string>([q]);
  for (const n of candidates) {
    const s = `${base}${base.endsWith(' ') ? '' : ' '}${n}`.trim();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

/**
 * Analizează query-ul pentru pagina /ro – returnează filtre inferate și termeni de căutare
 */
export function analyzeSearchForRo(query: string): SearchAnalysis {
  const q = (query || '').trim();
  const lower = q.toLowerCase();
  const analysis = analyzeQuery(q);
  const relatedTerms = getRelatedSearchTerms(q, 14);
  const primaryTerm = q;

  let categoryKey = 'all';
  let subcategoryKey = 'all';
  let brand = '';
  let level3 = 'all';
  let location = '';

  // Detect city in query (prefer longest matches: "targu mures" over "mures")
  const normalizedQuery = lower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const citiesByLength = [...ROMANIAN_CITIES].sort((a, b) => b.length - a.length);
  for (const city of citiesByLength) {
    const normCity = city
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normCity) continue;
    const escaped = normCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i');
    if (rx.test(normalizedQuery)) {
      location = city;
      break;
    }
  }

  // 1) Infer subcategory — cel mai lung termen potrivit câștigă (ex: „baterie bmw”: baterie → piese-auto, nu bmw → autoturisme)
  let bestLexicon: { cat: string; sub: string; score: number } | null = null;
  for (const { terms, cat, sub } of QUERY_TO_SUBCATEGORY) {
    for (const raw of terms) {
      const t = raw.trim().toLowerCase();
      if (!t) continue;
      const matches = lower.includes(t) || (t.length >= 2 && t.includes(lower));
      if (!matches) continue;
      const score = t.length;
      if (!bestLexicon || score > bestLexicon.score) {
        bestLexicon = { cat, sub, score };
      }
    }
  }
  if (bestLexicon) {
    categoryKey = bestLexicon.cat;
    subcategoryKey = bestLexicon.sub;
  }

  // 1b) Lexicon denumiri categorii / afișare (toate verticalele)
  if (categoryKey === 'all') {
    const fromLex = matchQueryToDisplayLexicon(lower);
    if (fromLex) {
      categoryKey = fromLex.cat;
      subcategoryKey = fromLex.sub;
    }
  }

  // 2) Override category from brand-detector if we found a brand/category
  if (analysis.brand?.fullBrand) {
    brand = analysis.brand.fullBrand;
    const catDisplay = analysis.brand.category;
    const mapped = catDisplay ? CATEGORY_DISPLAY_TO_KEY[catDisplay] : null;
    if (mapped) {
      if (categoryKey === 'all') categoryKey = mapped;
      // If we didn't infer subcategory yet, infer from brand for electronice
      if (subcategoryKey === 'all' && categoryKey === 'electronice') {
        const brandLower = brand.toLowerCase();
        if (brandLower.includes('apple') || brandLower.includes('iphone') || brandLower.includes('samsung') ||
            brandLower.includes('xiaomi') || brandLower.includes('huawei')) {
          subcategoryKey = 'telefoane';
        }
      }
    }
  }
  if (analysis.category) {
    const mapped = CATEGORY_DISPLAY_TO_KEY[analysis.category];
    if (mapped && categoryKey === 'all') categoryKey = mapped;
  }

  // 3) Level 3 for phones – iphone 14 → level3 = iphone
  if (subcategoryKey === 'telefoane' && CATEGORY_LEVEL_3['telefoane']) {
    const level3Opts = CATEGORY_LEVEL_3['telefoane'];
    for (const [term, l3] of Object.entries(PHONE_BRAND_TO_LEVEL3)) {
      if (lower.includes(term) && level3Opts.includes(l3)) {
        level3 = l3;
        break;
      }
    }
  }

  // 4) Level 3 pentru piese auto – Tip piesă (1:1 cu anunț manual / ?level3= slug)
  if (subcategoryKey === 'piese-auto' && CATEGORY_LEVEL_3['piese-auto']) {
    const level3Opts = new Set(CATEGORY_LEVEL_3['piese-auto']);
    const T = (label: string) => tipPiesaLabelToSlug(label);
    const PIESE_TERM_TO_LEVEL3: Record<string, string> = {
      motor: T('Motor'),
      chiulasa: T('Motor'),
      chiuloasa: T('Motor'),
      turbo: T('Turbo'),
      turbina: T('Turbo'),
      injector: T('Injectoare'),
      injectoare: T('Injectoare'),
      transmisie: T('Transmisie'),
      cutie: T('Transmisie'),
      ambreiaj: T('Transmisie'),
      cardan: T('Transmisie'),
      diferential: T('Transmisie'),
      suspensie: T('Suspensie'),
      amortizor: T('Suspensie'),
      arc: T('Suspensie'),
      frana: T('Frâne'),
      frane: T('Frâne'),
      etrier: T('Frâne'),
      placute: T('Frâne'),
      caroserie: T('Caroserie'),
      capota: T('Caroserie'),
      aripa: T('Caroserie'),
      bara: T('Caroserie'),
      parbriz: T('Caroserie'),
      far: T('Faruri & lumini'),
      faruri: T('Faruri & lumini'),
      xenon: T('Xenon'),
      interior: T('Interior auto'),
      scaun: T('Interior auto'),
      volan: T('Interior auto'),
      airbag: T('Interior auto'),
      alternator: T('Electrică auto'),
      ecu: T('Electrică auto'),
      senzor: T('Electrică auto'),
      electronice: T('Electrică auto'),
      baterie: T('Electrică auto'),
      audio: T('Audio auto'),
      anvelope: T('Jante & anvelope'),
      jante: T('Jante & anvelope'),
      ulei: T('Uleiuri'),
      filtre: T('Filtre'),
      diverse: T('Diverse'),
      altele: T('Diverse'),
    };
    for (const [term, l3slug] of Object.entries(PIESE_TERM_TO_LEVEL3)) {
      if (lower.includes(term) && level3Opts.has(l3slug)) {
        level3 = l3slug;
        break;
      }
    }
  }

  // 5) Brand pentru piese auto – ex: "aripa golf 5 bmw" → brand din analiză
  if (subcategoryKey === 'piese-auto' && !brand && analysis.brand?.fullBrand) {
    brand = analysis.brand.fullBrand;
    categoryKey = 'autovehicule';
  }

  // modelQuery: când avem brand + query care conține și cifre/cuvinte tip model (ex: "iphone 14", "seria 3", "golf 5")
  let modelQuery = '';
  if (subcategoryKey === 'piese-auto' && brand && q.length >= 2 && level3 === 'all') {
    modelQuery = q.trim(); // query-ul poate conține model (ex: "golf 5", "x5")
  }

  let allSearchTerms = [...new Set([primaryTerm, ...relatedTerms])];
  if (subcategoryKey !== 'all') allSearchTerms.push(subcategoryKey);
  if (categoryKey !== 'all') allSearchTerms.push(categoryKey);
  if (brand && brand.trim()) allSearchTerms.push(brand.trim().toLowerCase());
  allSearchTerms = [...new Set(allSearchTerms)];

  if (brand && q.length >= 2 && !(subcategoryKey === 'piese-auto' && level3 !== 'all')) {
    const trimmed = q.trim();
    // Considerăm că întreaga frază este un model dacă conține brandul și eventual un număr sau cuvânt suplimentar
    const brandLower = brand.toLowerCase();
    if (trimmed.includes(brandLower) || lower.includes(brandLower)) {
      modelQuery = trimmed;
    } else if (categoryKey !== 'all' && (subcategoryKey === 'telefoane' || subcategoryKey === 'autoturisme' || subcategoryKey === 'piese-auto' || subcategoryKey === 'motociclete' || subcategoryKey === 'laptopuri-pc')) {
      // Căutare tip "iPhone 14" sau "14" – brand e deja setat din analiză; query-ul e model
      modelQuery = trimmed;
    }
  }
  if (!modelQuery && brand && q && !(subcategoryKey === 'piese-auto' && level3 !== 'all')) {
    modelQuery = q.trim();
  }

  return {
    categoryKey,
    subcategoryKey,
    brand,
    level3,
    location,
    modelQuery,
    primaryTerm,
    relatedTerms,
    allSearchTerms,
  };
}
