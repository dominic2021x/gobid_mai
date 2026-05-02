/**
 * Deterministic extraction of draft fields from a single user message.
 * Used when a draft is active to fill multiple fields in one request (no LLM tool rounds).
 * - Title, description (after "descriere:"), price + currency (RON/EUR), category/subcategory (exact match only), county/city.
 */

export const TITLE_MAX_LENGTH = 200;

/** Category display names – must match form/dropdown values (e.g. my-products). */
const CATEGORIES: string[] = [
  "Imobiliare",
  "Autovehicule",
  "Utilaje & Echipamente",
  "Artă & Antichități",
  "Electronice & Tehnologie",
  "Casă & Grădină",
  "Modă & Lifestyle",
  "Mama și copilul",
  "Agricultură & Zootehnie",
  "Maritime & Aeronautice",
  "Business",
  "Materiale Construcții",
  "Diverse / Speciale",
];

/** Subcategory display names per category – exact match only. */
const SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  "Imobiliare": [
    "Apartamente",
    "Case și Vile",
    "Terenuri Intravilane",
    "Terenuri Agricole",
    "Spații Comerciale",
    "Hale Industriale",
    "Proprietăți Turistice",
  ],
  "Autovehicule": [
    "Autoturisme",
    "SUV / 4x4",
    "Motociclete și Scutere",
    "Camioane",
    "Remorci și Semiremorci",
    "Autorulote / Rulote",
    "Vehicule Electrice",
    "Piese Auto și Accesorii",
  ],
  "Utilaje & Echipamente": [
    "Utilaje Construcții",
    "Utilaje Agricole",
    "Echipamente Forestiere",
    "Generatoare și Compresoare",
    "Scule Profesionale",
    "Echipamente Ateliere Auto",
    "Echipamente Electrice / Sudură",
  ],
  "Artă & Antichități": [
    "Picturi",
    "Sculpturi",
    "Bijuterii și Ceasuri",
    "Obiecte de Colecție",
    "Mobilier de Epocă",
    "Cărți Rare, Hărți Vechi",
    "Fotografie Artistică",
    "Licitații Caritabile",
  ],
  "Electronice & Tehnologie": [
    "Laptopuri și PC-uri",
    "Telefoane Mobile",
    "Tablete",
    "TV & Audio",
    "Console & Jocuri",
    "Drone & Gadgeturi Smart",
    "Echipamente Foto/Video",
  ],
  "Casă & Grădină": [
    "Mobilier Interior",
    "Mobilier Exterior",
    "Echipamente de Grădinărit",
    "Decorațiuni",
    "Electrocasnice",
  ],
  "Modă & Lifestyle": [
    "Haine de Designer",
    "Încălțăminte",
    "Genți & Accesorii",
    "Parfumuri & Cosmetice",
    "Ceasuri de Lux",
  ],
  "Mama și copilul": [
    "Haine copil",
    "Încălțăminte copil",
    "Jucării",
    "Mobilier copil",
    "Coșul copilului",
    "Îngrijire bebeluși",
    "Scaune auto copil",
    "Cărucioare",
    "Hranire copil",
  ],
  "Agricultură & Zootehnie": [
    "Tractoare, Combine",
    "Remorci Agricole",
    "Echipamente de Irigații",
    "Animale",
    "Semințe, Furaje, Îngrășăminte",
  ],
  "Maritime & Aeronautice": [
    "Bărci, Iahturi, Skijeturi",
    "Motoare Marine",
    "Avioane Mici / Ultraleușoare",
    "Dronuri Industriale",
  ],
  "Business": [
    "Echipamente de Birou",
    "Mobilier Comercial",
    "Calculatoare Second-Hand",
    "Licitații Lichidări Firme",
    "Loturi Stocuri Produse",
  ],
  "Materiale Construcții": [
    "Ciment, Cărămidă, Oțel",
    "Materiale Izolație",
    "Feronerie, Unelte",
    "Uși, Ferestre, Tâmplărie",
  ],
  "Diverse / Speciale": [
    "Licitații Caritabile",
    "Obiecte Militare / Istorice",
    "NFT / Artă Digitală",
    "Colecții Private",
    "Bunuri Confiscate / Executări",
  ],
};

/** Romanian counties (județe) for location – exact match. */
const COUNTIES: string[] = [
  "Alba",
  "Arad",
  "Argeș",
  "Bacău",
  "Bihor",
  "Bistrița-Năsăud",
  "Botoșani",
  "Brașov",
  "Brăila",
  "Buzău",
  "Caraș-Severin",
  "Călărași",
  "Cluj",
  "Constanța",
  "Covasna",
  "Dâmbovița",
  "Dolj",
  "Galați",
  "Giurgiu",
  "Gorj",
  "Harghita",
  "Hunedoara",
  "Ialomița",
  "Iași",
  "Ilfov",
  "Maramureș",
  "Mehedinți",
  "Mureș",
  "Neamț",
  "Olt",
  "Prahova",
  "Sălaj",
  "Satu Mare",
  "Sibiu",
  "Suceava",
  "Teleorman",
  "Timiș",
  "Tulcea",
  "Vâlcea",
  "Vaslui",
  "Vrancea",
  "București",
];

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip diacritics for match
}

/** Returns display name if text matches a category exactly (case-insensitive, diacritics ignored). */
function matchCategory(text: string): string | null {
  const n = normalize(text);
  for (const cat of CATEGORIES) {
    if (normalize(cat) === n) return cat;
  }
  return null;
}

/** Returns display name if text matches a subcategory of the given category. */
function matchSubcategory(text: string, category: string): string | null {
  const subs = SUBCATEGORIES_BY_CATEGORY[category];
  if (!subs) return null;
  const n = normalize(text);
  for (const sub of subs) {
    if (normalize(sub) === n) return sub;
  }
  return null;
}

/** Match county in text (word boundary, case-insensitive). */
function extractCountyFromText(text: string): string | null {
  const lower = text.trim().toLowerCase();
  for (const county of COUNTIES) {
    const countyNorm = county.toLowerCase();
    const re = new RegExp(`\\b${countyNorm.replace(/[-\s]/g, "[-\\s]?")}\\b`, "i");
    if (re.test(lower)) return county;
  }
  return null;
}

export type ExtractedFields = {
  title?: string;
  description?: string;
  starting_price?: number;
  currency?: string;
  category?: string;
  subcategory?: string;
  county?: string;
  city?: string;
  /** When category/subcategory was mentioned but no exact match – ask user to clarify. */
  clarifyingMessage?: string;
};

/**
 * Parse price + currency: "5000 EUR", "5.000 Lei", "1000 euro", "1.234,56 Lei".
 * Returns value > 0 and currency in [RON, EUR] only.
 */
function extractPriceAndCurrency(text: string): { value: number; currency: string } | null {
  const trimmed = text.trim();
  const currencyMatch = trimmed.match(/\b(ron|eur|euro|lei)\b/i);
  const currency = currencyMatch
    ? currencyMatch[1].toUpperCase() === "RON" || currencyMatch[1].toLowerCase() === "lei"
      ? "RON"
      : "EUR"
    : null;

  const numFormats = [
    /(\d{1,3}(?:\s?\d{3})*(?:[.,]\d{1,2})?)\s*(?:ron|eur|euro|lei)/i,
    /(?:ron|eur|euro|lei)\s*(\d{1,3}(?:\s?\d{3})*(?:[.,]\d{1,2})?)/i,
    /(\d+(?:[.,]\d{1,2})?)\s*(?:ron|eur|euro|lei)/i,
    /(?:ron|eur|euro|lei)\s*(\d+(?:[.,]\d{1,2})?)/i,
  ];
  for (const re of numFormats) {
    const m = trimmed.match(re);
    if (m) {
      const numStr = m[1].replace(/\s/g, "").replace(",", ".");
      const value = parseFloat(numStr);
      if (Number.isFinite(value) && value > 0 && currency) return { value, currency };
    }
  }
  return null;
}

/**
 * Extract draft fields from user message deterministically.
 * - Title: first meaningful segment (before "descriere", price pattern, or truncated); max TITLE_MAX_LENGTH.
 * - Description: text after "descriere\s*:" or "descriere\s*".
 * - Price + currency: first match of number + Lei/EUR; validated > 0 and Lei|EUR.
 * - Category/subcategory: only set if exact match in known lists; otherwise clarifyingMessage.
 * - County/city: county from known list; city as following word or same line.
 */
export function extractFields(message: string): ExtractedFields {
  const out: ExtractedFields = {};
  const s = message.trim();

  const descIdx = s.search(/\bdescriere\s*[:\-]\s*/i);
  const descStart = descIdx >= 0 ? descIdx + (s.slice(descIdx).match(/\bdescriere\s*[:\-]\s*/i)?.[0]?.length ?? 0) : -1;
  const beforeDesc = descStart >= 0 ? s.slice(0, descIdx).trim() : s;
  if (descStart >= 0) {
    const desc = s.slice(descStart).trim();
    if (desc.length > 0) out.description = desc;
  }

  const priceCur = extractPriceAndCurrency(s);
  if (priceCur) {
    out.starting_price = priceCur.value;
    out.currency = priceCur.currency;
  }

  const county = extractCountyFromText(s);
  if (county) out.county = county;

  const titleCandidates: string[] = [];
  const parts = beforeDesc.split(/[,;]/).map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    if (extractPriceAndCurrency(p) || extractCountyFromText(p)) continue;
    const cat = matchCategory(p);
    if (cat) {
      out.category = cat;
      const sub = matchSubcategory(p, cat);
      if (sub) out.subcategory = sub;
      continue;
    }
    if (out.category) {
      const sub = matchSubcategory(p, out.category);
      if (sub) {
        out.subcategory = sub;
        continue;
      }
    }
    let titlePart = p.replace(/\d{1,3}(?:\s?\d{3})*(?:[.,]\d{1,2})?\s*(?:ron|eur|euro|lei)/gi, "").trim();
    if (!titlePart) titlePart = p;
    if (titlePart.length >= 2 && !/^(ron|eur|euro|lei)$/i.test(titlePart)) titleCandidates.push(titlePart);
  }
  if (titleCandidates.length > 0) {
    const rawTitle = titleCandidates[0];
    const title = rawTitle.length > TITLE_MAX_LENGTH ? rawTitle.slice(0, TITLE_MAX_LENGTH).trim() : rawTitle;
    if (title.length > 0) out.title = title;
  }

  const words = s.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].replace(/[,.]/g, "");
    if (county && w.toLowerCase() === county.toLowerCase()) {
      const next = words[i + 1].replace(/[,.]/g, "");
      if (next.length >= 2 && !COUNTIES.some((c) => normalize(c) === normalize(next))) {
        out.city = next;
      }
      break;
    }
  }

  return out;
}

/**
 * Returns which fields were extracted (for applying only those).
 */
export function getExtractedFieldEntries(fields: ExtractedFields): Array<{ field: string; value: unknown }> {
  const entries: Array<{ field: string; value: unknown }> = [];
  if (fields.title != null) entries.push({ field: "title", value: fields.title });
  if (fields.description != null) entries.push({ field: "description", value: fields.description });
  if (fields.starting_price != null) entries.push({ field: "starting_price", value: fields.starting_price });
  if (fields.currency != null) entries.push({ field: "currency", value: fields.currency });
  if (fields.category != null) entries.push({ field: "category", value: fields.category });
  if (fields.subcategory != null) entries.push({ field: "subcategory", value: fields.subcategory });
  if (fields.county != null) entries.push({ field: "county", value: fields.county });
  if (fields.city != null) entries.push({ field: "city", value: fields.city });
  return entries;
}

/** For validation messages: list subcategories for a given category. */
export function getSubcategoriesForCategory(category: string): string[] {
  return SUBCATEGORIES_BY_CATEGORY[category] ?? [];
}

export type DraftContextForSlot = {
  currency?: string;
  category?: string;
};

/**
 * Parse a single field from a short user reply (context-aware slot filling).
 * Used when the previous assistant message asked for a specific field.
 * Deterministic only.
 */
export function extractForField(
  field: string,
  message: string,
  context?: DraftContextForSlot
): Partial<ExtractedFields> {
  const trimmed = message.trim();
  if (!trimmed) return {};

  switch (field) {
    case "title": {
      const title = trimmed.length > TITLE_MAX_LENGTH ? trimmed.slice(0, TITLE_MAX_LENGTH).trim() : trimmed;
      return title.length > 0 ? { title } : {};
    }
    case "description":
      return { description: trimmed };
    case "category": {
      const cat = matchCategory(trimmed);
      return cat ? { category: cat } : {};
    }
    case "subcategory": {
      if (!context?.category) return {};
      const sub = matchSubcategory(trimmed, context.category);
      return sub ? { subcategory: sub } : {};
    }
    case "starting_price": {
      const priceCur = extractPriceAndCurrency(trimmed);
      if (priceCur) return { starting_price: priceCur.value, currency: priceCur.currency };
      const numMatch = trimmed.replace(/\s/g, "").replace(",", ".").match(/^(\d+(?:\.\d{1,2})?)$/);
      if (numMatch) {
        const value = parseFloat(numMatch[1]);
        if (Number.isFinite(value) && value > 0) {
          const currency =
            /\b(eur|euro)\b/i.test(trimmed) ? "EUR" : (context?.currency ?? "RON");
          return { starting_price: value, currency };
        }
      }
      return {};
    }
    case "currency": {
      const c = /\b(ron|lei)\b/i.test(trimmed) ? "RON" : /\b(eur|euro)\b/i.test(trimmed) ? "EUR" : null;
      return c ? { currency: c } : {};
    }
    case "county": {
      const county = extractCountyFromText(trimmed);
      return county ? { county } : {};
    }
    case "city":
      return trimmed.length >= 2 ? { city: trimmed } : {};
    default:
      return {};
  }
}
