import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { inferIntentCategoriesFromQuery } from "@/lib/search/categoryRules";
import { classify } from "@/lib/categorization/engine";
import { classifyLandRO } from "@/lib/categorization/rules/roLandRules";
import { getOpenAIClient } from "@/lib/ai/openai";
import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


type ScanMode = "rules" | "chatgpt" | "claude" | "ollama";
type ListingScope = "all" | "live-bid" | "licitatii-publice";

type ScanRow = {
  productId: string;
  slug?: string;
  announcementUrl: string;
  announcementCode: string;
  title: string;
  isLicitatiiPublice: boolean;
  currentCategory: string;
  currentSubcategory: string;
  currentListCategory: string;
  suggestedCategory: string;
  suggestedSubcategory: string;
  suggestedListCategory: string;
  confidence: number;
  engine: ScanMode;
  mismatch: boolean;
  city: string;
  inferredLocation: string;
  locationSource: "existing" | "description" | "none";
  locationConfidence: number;
};

type NewCategoryCandidate = {
  proposedType: "category" | "subcategory";
  name: string;
  parentCategorySlug?: string;
  parentCategoryLabel?: string;
  hits: number;
  evidence: string[];
  reason: string;
};

type OptimizationIdea = {
  priority: "high" | "medium" | "low";
  title: string;
  details: string;
};

const STOP_WORDS = new Set([
  "vand",
  "vând",
  "vanzare",
  "vânzare",
  "licitatie",
  "licitație",
  "publica",
  "publică",
  "de",
  "la",
  "si",
  "și",
  "cu",
  "pentru",
  "din",
  "in",
  "în",
  "un",
  "o",
  "the",
  "produs",
  "produse",
  "set",
  "lot",
  "anunt",
  "anunț",
  "noi",
  "nou",
  "noua",
  "nouă",
]);

const CATEGORY_SLUGS = Object.keys(RO_CATEGORIES).filter((k) => k !== "all");
const SUBCATEGORY_SLUGS = Object.entries(RO_CATEGORIES)
  .flatMap(([cat, val]) => (cat === "all" ? [] : val.subcategories))
  .filter(Boolean);
const NORMALIZED_CITIES = ROMANIAN_CITIES.map((city) => ({
  original: city,
  normalized: normalizeText(city),
})).sort((a, b) => b.normalized.length - a.normalized.length);

const DESCRIPTION_LOCATION_HINTS = [
  /\b(str|strada|bd|bulevard|blvd|calea|piata|piața|sector)\b/i,
  /\b(jud|judet|județ|comuna|sat|oras|oraș|municipiu)\b/i,
  /\b(nr|numar|număr|ap|apartament|bloc|scara|sc)\b/i,
];

const EXEC_SUBCATEGORY_SET = new Set(RO_CATEGORIES.executari?.subcategories || []);
const EXEC_CLASSIFIERS: Array<{ subcategory: string; terms: RegExp[] }> = [
  {
    subcategory: "exec-imobiliare",
    terms: [
      /\b(teren|apartament|garsoniera|vila|imobiliare)\b/,
      /\b(casa)\b(?!\s*(de|din|pentru)\b)/,
      /\b(intravilan|extravilan|proprietate imobiliara|proprietati imobiliare)\b/,
    ],
  },
  {
    subcategory: "exec-autovehicule",
    terms: [
      /\b(auto|autoturism|vehicul|camion|tir|motocic|scuter|remorca|semiremorca|rulota)\b/,
      /\b(dacia|bmw|audi|mercedes|ford|volkswagen|vw|renault|opel|skoda)\b/,
    ],
  },
  {
    subcategory: "exec-industrial",
    terms: [
      /\b(utilaj|echipament|industrial|tractor|excavator|buldo|stivuitor|generator|compresor|linie productie|cnc|laser)\b/,
      /\b(fabrica|atelier|constructii|agricol|agricultura)\b/,
    ],
  },
  {
    subcategory: "exec-office",
    terms: [
      /\b(office|birou|calculator|laptop|pc|imprimanta|server|monitor|copiator|mobilier birou)\b/,
      /\b(it|hardware|software)\b/,
    ],
  },
  {
    subcategory: "exec-afaceri",
    terms: [
      /\b(afacere|firma|societate|lichidare|faliment|administrator judiciar|stoc marfa|franciza|mobilier)\b/,
      /\b(restaurant|hotel|pensiune|service auto)\b/,
    ],
  },
  {
    subcategory: "oferte-grupate",
    terms: [
      /\b(lot|loturi|grupat|grupate|pachet|bundle|stoc)\b/,
    ],
  },
];

const CONSUMER_GOODS_TERMS =
  /\b(mobilier|grill|toaster|electrocasnic|frigider|aragaz|masina de spalat|canapea|scaun|masa|televizor|cuptor)\b/;
const STRONG_REAL_ESTATE_TERMS =
  /\b(teren|apartament|garsoniera|vila|imobiliare|intravilan|extravilan|proprietate imobiliara|proprietati imobiliare)\b/;
const STRONG_AUTO_TERMS =
  /\b(auto|autoturism|autoutilitara|utilitara|vehicul|camion|van|duba|motocic|remorca|semiremorca|rulota|combo|doblo|dokker)\b/;

function toDisplayCategory(slug: string): string {
  return RO_CATEGORIES[slug]?.name || slug;
}

function toDisplaySubcategory(slug: string): string {
  return RO_SUBCATEGORY_NAMES[slug] || slug;
}

function buildAnnouncementUrl(product: any): string {
  const explicitUrl = String(product?.url || "").trim();
  // Never return /ro listing page as announcement URL.
  if (explicitUrl && !/^\/ro(?:$|\?)/i.test(explicitUrl)) return explicitUrl;
  const slug = String(product?.slug || "").trim();
  const id = String(product?.id || "").trim();
  const productType = String(product?.product_type || "").trim().toLowerCase();
  const identifier = slug || id;
  if (!identifier) return "/";
  if (productType === "licitatii-publice") return `/licitatii-publice/${identifier}`;
  if (productType === "live-bid") return `/live_bid/${identifier}`;
  if (productType === "buy-now") return `/produs/${identifier}`;
  // Default to product detail route, never /ro or /produse.
  return `/produs/${identifier}`;
}

function normalizeText(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleKeywords(title: string): string[] {
  const words = normalizeText(title).split(" ");
  return words
    .filter((w) => w.length >= 4)
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, 8);
}

function extractKeywordsFromText(text: string, limit = 12): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((w) => w.length >= 4)
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, limit);
}

function inferLocationFromDescription(description: string, currentCity: string): {
  inferredLocation: string;
  source: "existing" | "description" | "none";
  confidence: number;
} {
  const cleanedCurrent = String(currentCity || "").trim();
  if (cleanedCurrent) {
    return { inferredLocation: cleanedCurrent, source: "existing", confidence: 0.95 };
  }

  const text = normalizeText(description || "");
  if (!text) {
    return { inferredLocation: "", source: "none", confidence: 0 };
  }

  const matched = NORMALIZED_CITIES.find((c) => {
    const escaped = c.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i").test(text);
  });

  if (!matched) {
    return { inferredLocation: "", source: "none", confidence: 0 };
  }

  const hasAddressHints = DESCRIPTION_LOCATION_HINTS.some((rx) => rx.test(description || ""));
  return {
    inferredLocation: matched.original,
    source: "description",
    confidence: hasAddressHints ? 0.9 : 0.75,
  };
}

function inferByRules(title: string, description?: string): { categorySlug: string; subcategorySlug: string; confidence: number } {
  const query = `${title || ""} ${description || ""}`.trim();
  const q = normalizeText(query);
  const hasConsumerGoods = CONSUMER_GOODS_TERMS.test(q);
  const hasStrongRealEstate = STRONG_REAL_ESTATE_TERMS.test(q);
  const hasHouseWord = /\b(casa)\b(?!\s*(de|din|pentru)\b)/.test(q);
  const hasVeryStrongRealEstate = /\b(teren|apartament|garsoniera|vila|intravilan|extravilan)\b/.test(q);

  // Prioritate real-estate: dacă este teren/apartament/casă/vilă, merge pe imobiliare.
  if ((hasStrongRealEstate || hasHouseWord) && !(hasConsumerGoods && !hasVeryStrongRealEstate)) {
    if (/\b(teren)\b/.test(q)) {
      return { categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane", confidence: 0.92 };
    }
    if (/\b(apartament|garsoniera)\b/.test(q)) {
      return { categorySlug: "imobiliare", subcategorySlug: "apartamente", confidence: 0.92 };
    }
    if (/\b(casa|vila)\b/.test(q)) {
      return { categorySlug: "imobiliare", subcategorySlug: "case-vile", confidence: 0.92 };
    }
    if (/\b(spatiu comercial)\b/.test(q)) {
      return { categorySlug: "imobiliare", subcategorySlug: "spatii-comerciale", confidence: 0.9 };
    }
    if (/\b(hala)\b/.test(q)) {
      return { categorySlug: "imobiliare", subcategorySlug: "hale-industriale", confidence: 0.9 };
    }
    return { categorySlug: "imobiliare", subcategorySlug: "apartamente", confidence: 0.88 };
  }

  // Prioritate auto: licitațiile auto nu trebuie mutate în afaceri.
  if (STRONG_AUTO_TERMS.test(q)) {
    if (/\b(camion|tir)\b/.test(q)) {
      return { categorySlug: "autovehicule", subcategorySlug: "camioane", confidence: 0.92 };
    }
    if (/\b(motocic|scuter)\b/.test(q)) {
      return { categorySlug: "autovehicule", subcategorySlug: "motociclete", confidence: 0.92 };
    }
    if (/\b(remorca|semiremorca|rulota)\b/.test(q)) {
      return { categorySlug: "autovehicule", subcategorySlug: "remorci", confidence: 0.9 };
    }
    return { categorySlug: "autovehicule", subcategorySlug: "autoturisme", confidence: 0.92 };
  }

  // Executări - oferte grupate / loturi (high priority)
  if (
    /\b(licitatie|licitatie publica|insolventa|executare|pret de pornire|pornire|lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(
      q
    ) &&
    /\b(lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(q)
  ) {
    return { categorySlug: "executari", subcategorySlug: "oferte-grupate", confidence: 0.9 };
  }

  // High-priority overrides to avoid false mapping to casa/mobilier.
  // Example: "echipament ... licitatie ... pret ... TVA" should be business/utilaje, not furniture.
  if (/\b(licitatie|licitatie publica|insolventa|executare|lichidare|faliment|administrator judiciar|tva|pret)\b/.test(q)) {
    if (/\b(echipament|utilaj|masina industriala|linie|industrial|productie|laser|cnc)\b/.test(q)) {
      return { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii", confidence: 0.86 };
    }
    return { categorySlug: "business", subcategorySlug: "lichidari-firme", confidence: 0.84 };
  }

  if (/\b(echipament|utilaj|tractor|excavator|generator|compresor|industrial|productie|laser|cnc)\b/.test(q)) {
    return { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii", confidence: 0.82 };
  }

  if (/\b(afacere|firma|societate|stoc|lichidare|office|birou|comercial)\b/.test(q)) {
    return { categorySlug: "business", subcategorySlug: "lichidari-firme", confidence: 0.8 };
  }

  if (/\b(auto|autoturism|vehicul|camion|motocic|remorca)\b/.test(q)) {
    return { categorySlug: "autovehicule", subcategorySlug: "autoturisme", confidence: 0.85 };
  }

  const intents = inferIntentCategoriesFromQuery(query);
  const first = intents[0];
  if (!first || first.categorySlug === "all") {
    return { categorySlug: "diverse", subcategorySlug: "colectii-private", confidence: 0.45 };
  }
  const fallbackSub = RO_CATEGORIES[first.categorySlug]?.subcategories?.[0] || "colectii-private";
  return {
    categorySlug: first.categorySlug,
    subcategorySlug: first.subcategorySlug && first.subcategorySlug !== "all" ? first.subcategorySlug : fallbackSub,
    confidence: 0.72,
  };
}

function isLicitatiiPubliceProduct(product: any): boolean {
  const productType = normalizeText(String(product?.product_type || ""));
  const saleType = normalizeText(String(product?.sale_type || ""));
  return productType === "licitatii-publice" || saleType === "licitatii-insolventa" || saleType === "licitatie-publica";
}

function getCurrentListCategory(product: any): string {
  const cf = (product?.custom_fields && typeof product.custom_fields === "object") ? product.custom_fields : {};
  return String((cf as any)?.listing_category || "").trim();
}

function getAnnouncementCode(product: any): string {
  const cf = (product?.custom_fields && typeof product.custom_fields === "object") ? product.custom_fields : {};
  const code = String((cf as any)?.cod_anunt || (cf as any)?.["Cod anunț"] || "").trim();
  return code;
}

function mapSuggestedSubcategoryToExecutari(
  suggestedSubcategory: string,
  title: string,
  description: string,
  currentSubcategory: string
): string {
  const q = normalizeText(`${title || ""} ${description || ""}`);
  const hasConsumerGoods = CONSUMER_GOODS_TERMS.test(q);
  const hasStrongRealEstate = STRONG_REAL_ESTATE_TERMS.test(q);
  const hasHouseWord = /\b(casa)\b(?!\s*(de|din|pentru)\b)/.test(q);
  const hasVeryStrongRealEstate = /\b(teren|apartament|garsoniera|vila|intravilan|extravilan)\b/.test(q);

  // Hard override: dacă textul e despre bunuri (mobilier/electronice/electrocasnice),
  // NU îl trimitem în imobiliare decât cu semnale imobiliare foarte clare.
  if (hasConsumerGoods && !hasVeryStrongRealEstate) {
    if (/\b(lot|loturi|grupat|grupate|pachet|stoc)\b/.test(q)) return "oferte-grupate";
    if (/\b(electronic|electronice|laptop|pc|monitor|server|it)\b/.test(q)) return "exec-office";
    return "exec-afaceri";
  }
  if (hasConsumerGoods && (hasStrongRealEstate || hasHouseWord) && !hasVeryStrongRealEstate) {
    if (/\b(lot|loturi|grupat|grupate|pachet|stoc)\b/.test(q)) return "oferte-grupate";
    return "exec-afaceri";
  }
  if (STRONG_AUTO_TERMS.test(q)) return "exec-autovehicule";

  const normalizedSuggested = normalizeText(suggestedSubcategory);
  if (EXEC_SUBCATEGORY_SET.has(normalizedSuggested)) return normalizedSuggested;

  const genericToExec: Record<string, string> = {
    apartamente: "exec-imobiliare",
    "case-vile": "exec-imobiliare",
    "terenuri-intravilane": "exec-imobiliare",
    "terenuri-agricole": "exec-imobiliare",
    "spatii-comerciale": "exec-imobiliare",
    "hale-industriale": "exec-imobiliare",
    autoturisme: "exec-autovehicule",
    "suv-4x4": "exec-autovehicule",
    motociclete: "exec-autovehicule",
    camioane: "exec-autovehicule",
    remorci: "exec-autovehicule",
    autorulote: "exec-autovehicule",
    "vehicule-electrice": "exec-autovehicule",
    "piese-auto": "exec-autovehicule",
    "utilaje-constructii": "exec-industrial",
    "utilaje-agricole": "exec-industrial",
    "tractoare-combine": "exec-industrial",
    "echipamente-forestiere": "exec-industrial",
    generatoare: "exec-industrial",
    "echipamente-electrice": "exec-industrial",
    "echipamente-birou": "exec-office",
    "mobilier-comercial": "exec-office",
    "calculatoare-second": "exec-office",
    "lichidari-firme": "exec-afaceri",
    "loturi-stocuri": "oferte-grupate",
  };
  if (genericToExec[normalizedSuggested]) return genericToExec[normalizedSuggested];

  const scored = EXEC_CLASSIFIERS.map((cfg) => ({
    subcategory: cfg.subcategory,
    score: cfg.terms.reduce((acc, rx) => acc + (rx.test(q) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > 0) return scored[0].subcategory;

  const normalizedCurrent = normalizeText(currentSubcategory);
  if (EXEC_SUBCATEGORY_SET.has(normalizedCurrent)) return normalizedCurrent;
  return "exec-altele";
}

function inferExecutariListCategory(title: string, description: string, currentListCategory: string, execSubcategory: string): string {
  const q = normalizeText(`${title || ""} ${description || ""}`);
  if (/\b(lot|loturi|grupat|grupate|pachet)\b/.test(q)) return "oferte-grupate";
  if (execSubcategory === "exec-imobiliare") {
    if (CONSUMER_GOODS_TERMS.test(q) && !/\b(teren|apartament|garsoniera|vila|intravilan|extravilan)\b/.test(q)) return "Altele";
    if (/\b(teren)\b/.test(q) && /\b(cladire|constructie|casa)\b/.test(q)) return "Teren cu cladire";
    if (/\b(teren)\b/.test(q)) return "Terenuri";
    if (/\b(apartament|garsoniera|vila)\b/.test(q) || /\b(casa)\b(?!\s*(de|din|pentru)\b)/.test(q)) return "Apartamente si case";
    if (/\b(spatiu comercial|hala)\b/.test(q)) return "Spații comerciale și hale";
    return "Imobile";
  }
  if (execSubcategory === "exec-autovehicule") {
    if (/\b(auto|autoturism|autoutilitara|utilitara|van|duba|combo|doblo|dokker)\b/.test(q)) return "Auto";
    if (/\b(camion|tir)\b/.test(q)) return "Camioane";
    if (/\b(motocic|scuter)\b/.test(q)) return "Moto";
    if (/\b(remorca|semiremorca|rulota)\b/.test(q)) return "Remorci / rulote";
    return "Auto";
  }
  if (execSubcategory === "exec-industrial") {
    if (/\b(tractor|agricol|agricultura)\b/.test(q)) return "Utilaje agricole";
    if (/\b(excavator|buldo|constructii)\b/.test(q)) return "Utilaje construcții";
    return "Utilaje si echipamente";
  }
  if (execSubcategory === "exec-office") {
    if (/\b(calculator|laptop|pc|server|monitor)\b/.test(q)) return "IT / hardware";
    if (/\b(mobilier birou|birou)\b/.test(q)) return "Mobilier birou";
    return "Office";
  }
  if (execSubcategory === "exec-afaceri") {
    if (/\b(stoc|marfa)\b/.test(q)) return "Stocuri";
    if (/\b(restaurant|hotel|pensiune)\b/.test(q)) return "Afaceri HoReCa";
    return "Afaceri";
  }
  return currentListCategory?.trim() || "Altele";
}

function applySpecialCategoryOverrides(
  title: string,
  description: string,
  suggestion: { categorySlug: string; subcategorySlug: string; confidence: number; engine: ScanMode }
): { categorySlug: string; subcategorySlug: string; confidence: number; engine: ScanMode } {
  const q = normalizeText(`${title || ""} ${description || ""}`);
  const hasConsumerGoods = CONSUMER_GOODS_TERMS.test(q);
  const hasStrongRealEstate = STRONG_REAL_ESTATE_TERMS.test(q);
  const hasHouseWord = /\b(casa)\b(?!\s*(de|din|pentru)\b)/.test(q);
  const hasVeryStrongRealEstate = /\b(teren|apartament|garsoniera|vila|intravilan|extravilan)\b/.test(q);
  if (STRONG_AUTO_TERMS.test(q)) {
    return {
      ...suggestion,
      categorySlug: "autovehicule",
      subcategorySlug: /\b(camion|tir)\b/.test(q)
        ? "camioane"
        : /\b(motocic|scuter)\b/.test(q)
        ? "motociclete"
        : /\b(remorca|semiremorca|rulota)\b/.test(q)
        ? "remorci"
        : "autoturisme",
      confidence: Math.max(suggestion.confidence, 0.92),
    };
  }
  const hasRealEstate =
    (hasStrongRealEstate || hasHouseWord) && !(hasConsumerGoods && !hasVeryStrongRealEstate);
  if (hasRealEstate) {
    if (/\b(teren)\b/.test(q)) {
      return { ...suggestion, categorySlug: "imobiliare", subcategorySlug: "terenuri-intravilane", confidence: Math.max(suggestion.confidence, 0.92) };
    }
    if (/\b(apartament|garsoniera)\b/.test(q)) {
      return { ...suggestion, categorySlug: "imobiliare", subcategorySlug: "apartamente", confidence: Math.max(suggestion.confidence, 0.92) };
    }
    if (/\b(casa|vila)\b/.test(q)) {
      return { ...suggestion, categorySlug: "imobiliare", subcategorySlug: "case-vile", confidence: Math.max(suggestion.confidence, 0.92) };
    }
    return { ...suggestion, categorySlug: "imobiliare", subcategorySlug: "apartamente", confidence: Math.max(suggestion.confidence, 0.88) };
  }
  if (
    /\b(licitatie|licitatie publica|insolventa|executare|pret de pornire|pornire|lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(
      q
    ) &&
    /\b(lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(q)
  ) {
    return {
      ...suggestion,
      categorySlug: "executari",
      subcategorySlug: "oferte-grupate",
      confidence: Math.max(suggestion.confidence, 0.9),
    };
  }
  return suggestion;
}

async function inferByChatgpt(title: string, description?: string): Promise<{ categorySlug?: string; subcategorySlug?: string; confidence: number }> {
  try {
    const openai = getOpenAIClient();
    const prompt = `Clasifică anunțul în taxonomy fixă.

Taxonomy categorii (slug): ${CATEGORY_SLUGS.join(", ")}
Taxonomy subcategorii (slug): ${SUBCATEGORY_SLUGS.join(", ")}

Titlu: "${title || ""}"
Descriere: "${(description || "").slice(0, 800)}"

Răspunde DOAR JSON valid:
{"categorySlug":"...","subcategorySlug":"...","confidence":0.0}

Reguli:
- categorySlug trebuie să existe în lista de categorii.
- subcategorySlug trebuie să existe în lista de subcategorii și să aparțină categoriei.
- confidence între 0 și 1.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Ești un clasificator strict de categorii pentru ecommerce. Răspunzi exclusiv JSON." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw) as { categorySlug?: string; subcategorySlug?: string; confidence?: number };
    const categorySlug = String(parsed.categorySlug || "").trim();
    const subcategorySlug = String(parsed.subcategorySlug || "").trim();
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.84;

    if (!CATEGORY_SLUGS.includes(categorySlug)) return { confidence: 0.2 };
    if (!SUBCATEGORY_SLUGS.includes(subcategorySlug)) return { confidence: 0.2 };
    if (!RO_CATEGORIES[categorySlug]?.subcategories?.includes(subcategorySlug)) return { confidence: 0.2 };

    return { categorySlug, subcategorySlug, confidence };
  } catch {
    return { confidence: 0.2 };
  }
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return "{}";
}

async function inferByClaude(title: string, description?: string): Promise<{ categorySlug?: string; subcategorySlug?: string; confidence: number }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { confidence: 0.2 };
    const model = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";
    const prompt = `Clasifică anunțul în taxonomy fixă.

Taxonomy categorii (slug): ${CATEGORY_SLUGS.join(", ")}
Taxonomy subcategorii (slug): ${SUBCATEGORY_SLUGS.join(", ")}

Titlu: "${title || ""}"
Descriere: "${(description || "").slice(0, 900)}"

Răspunde DOAR JSON valid:
{"categorySlug":"...","subcategorySlug":"...","confidence":0.0}

Reguli:
- categorySlug trebuie să existe în lista de categorii.
- subcategorySlug trebuie să existe în lista de subcategorii și să aparțină categoriei.
- confidence între 0 și 1.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0.1,
        system: "Ești un clasificator strict de categorii pentru ecommerce. Răspunzi exclusiv JSON.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) return { confidence: 0.2 };
    const payload = (await response.json()) as any;
    const text = Array.isArray(payload?.content)
      ? payload.content
          .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
          .join("\n")
          .trim()
      : "";
    const parsed = JSON.parse(extractJsonObject(text)) as {
      categorySlug?: string;
      subcategorySlug?: string;
      confidence?: number;
    };
    const categorySlug = String(parsed.categorySlug || "").trim();
    const subcategorySlug = String(parsed.subcategorySlug || "").trim();
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.82;

    if (!CATEGORY_SLUGS.includes(categorySlug)) return { confidence: 0.2 };
    if (!SUBCATEGORY_SLUGS.includes(subcategorySlug)) return { confidence: 0.2 };
    if (!RO_CATEGORIES[categorySlug]?.subcategories?.includes(subcategorySlug)) return { confidence: 0.2 };
    return { categorySlug, subcategorySlug, confidence };
  } catch {
    return { confidence: 0.2 };
  }
}

async function inferByOllama(title: string, description?: string): Promise<{ categorySlug?: string; subcategorySlug?: string; confidence: number }> {
  try {
    const host = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
    const prompt = `Clasifică anunțul în taxonomy fixă.

Taxonomy categorii (slug): ${CATEGORY_SLUGS.join(", ")}
Taxonomy subcategorii (slug): ${SUBCATEGORY_SLUGS.join(", ")}

Titlu: "${title || ""}"
Descriere: "${(description || "").slice(0, 900)}"

Răspunde DOAR JSON valid:
{"categorySlug":"...","subcategorySlug":"...","confidence":0.0}

Reguli:
- categorySlug trebuie să existe în lista de categorii.
- subcategorySlug trebuie să existe în lista de subcategorii și să aparțină categoriei.
- confidence între 0 și 1.`;

    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: "Ești un clasificator strict de categorii pentru ecommerce. Răspunzi exclusiv JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return { confidence: 0.2 };
    const payload = (await response.json()) as any;
    const raw = String(payload?.message?.content || "{}").trim();
    const parsed = JSON.parse(extractJsonObject(raw)) as {
      categorySlug?: string;
      subcategorySlug?: string;
      confidence?: number;
    };
    const categorySlug = String(parsed.categorySlug || "").trim();
    const subcategorySlug = String(parsed.subcategorySlug || "").trim();
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.8;

    if (!CATEGORY_SLUGS.includes(categorySlug)) return { confidence: 0.2 };
    if (!SUBCATEGORY_SLUGS.includes(subcategorySlug)) return { confidence: 0.2 };
    if (!RO_CATEGORIES[categorySlug]?.subcategories?.includes(subcategorySlug)) return { confidence: 0.2 };
    return { categorySlug, subcategorySlug, confidence };
  } catch {
    return { confidence: 0.2 };
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      offset?: number;
      limit?: number;
      mode?: ScanMode;
      onlyMismatched?: boolean;
      listingScope?: ListingScope;
    };

    const offset = Math.max(0, Number(body.offset || 0));
    const limit = Math.min(200, Math.max(10, Number(body.limit || 60)));
    const mode: ScanMode =
      body.mode === "chatgpt"
        ? "chatgpt"
        : body.mode === "claude"
        ? "claude"
        : body.mode === "ollama"
        ? "ollama"
        : "rules";
    const onlyMismatched = Boolean(body.onlyMismatched ?? true);
    const listingScope: ListingScope =
      body.listingScope === "live-bid" || body.listingScope === "licitatii-publice" ? body.listingScope : "all";

    const countLiveBidQuery = supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .or("status.eq.active,approval_status.eq.approved")
      .eq("product_type", "live-bid");
    const countPublicQuery = supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .or("status.eq.active,approval_status.eq.approved")
      .or("product_type.eq.licitatii-publice,sale_type.eq.licitatii-insolventa,sale_type.eq.licitatie-publica");

    const [{ count: totalLiveBid }, { count: totalLicitatiiPublice }] = await Promise.all([countLiveBidQuery, countPublicQuery]);

    let productsQuery = supabaseAdmin
      .from("products")
      .select("id,slug,url,title,description,category,subcategory,city,product_location,status,approval_status,product_type,sale_type,custom_fields")
      .or("status.eq.active,approval_status.eq.approved")
      .not("title", "is", null)
      .range(offset, offset + limit - 1);

    if (listingScope === "live-bid") {
      productsQuery = productsQuery.eq("product_type", "live-bid");
    } else if (listingScope === "licitatii-publice") {
      productsQuery = productsQuery.or("product_type.eq.licitatii-publice,sale_type.eq.licitatii-insolventa,sale_type.eq.licitatie-publica");
    }

    const { data: products, error } = await productsQuery;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows: ScanRow[] = [];
    const logs: string[] = [];
    const keywordBuckets = new Map<string, Map<string, number>>();
    const unknownTokenBuckets = new Map<string, number>();
    const unknownPhraseBuckets = new Map<string, number>();

    for (const p of products || []) {
      const title = String((p as any).title || "").trim();
      const description = String((p as any).description || "").trim();
      const currentCategory = String((p as any).category || "").trim();
      const currentSubcategory = String((p as any).subcategory || "").trim();
      const isLicitatiiPublice = isLicitatiiPubliceProduct(p);
      const currentListCategory = getCurrentListCategory(p);
      const city = String((p as any).city || (p as any).product_location || "").trim();
      const locationGuess = inferLocationFromDescription(description, city);

      const engineResult = classify({
        title,
        description: description || undefined,
        currentCategory,
        currentSubcategory,
      });
      const landRule = !engineResult ? classifyLandRO({
        title,
        description,
        currentCategory,
        currentSubcategory,
      }) : null;
      const rules = engineResult
        ? {
            categorySlug: engineResult.categorySlug,
            subcategorySlug: engineResult.subcategorySlug,
            confidence: engineResult.confidence,
          }
        : landRule
        ? {
            categorySlug: landRule.category,
            subcategorySlug: landRule.subcategory,
            confidence: 1 as number,
          }
        : inferByRules(title, description);
      let suggested: { categorySlug: string; subcategorySlug: string; confidence: number; engine: ScanMode } = {
        ...rules,
        engine: "rules",
      };

      if (mode === "chatgpt") {
        const llm = await inferByChatgpt(title, description);
        if (llm.categorySlug && llm.subcategorySlug && llm.confidence >= 0.5) {
          suggested = {
            categorySlug: llm.categorySlug,
            subcategorySlug: llm.subcategorySlug,
            confidence: Math.max(llm.confidence, 0.8),
            engine: "chatgpt",
          };
        }
      } else if (mode === "claude") {
        const llm = await inferByClaude(title, description);
        if (llm.categorySlug && llm.subcategorySlug && llm.confidence >= 0.5) {
          suggested = {
            categorySlug: llm.categorySlug,
            subcategorySlug: llm.subcategorySlug,
            confidence: Math.max(llm.confidence, 0.78),
            engine: "claude",
          };
        }
      } else if (mode === "ollama") {
        const llm = await inferByOllama(title, description);
        if (llm.categorySlug && llm.subcategorySlug && llm.confidence >= 0.5) {
          suggested = {
            categorySlug: llm.categorySlug,
            subcategorySlug: llm.subcategorySlug,
            confidence: Math.max(llm.confidence, 0.75),
            engine: "ollama",
          };
        }
      }
      suggested = applySpecialCategoryOverrides(title, description, suggested);

      let suggestedCategory = suggested.categorySlug;
      let suggestedSubcategory = suggested.subcategorySlug;
      let suggestedListCategory = "";

      if (isLicitatiiPublice) {
        suggestedCategory = "executari";
        suggestedSubcategory = mapSuggestedSubcategoryToExecutari(
          suggested.subcategorySlug,
          title,
          description,
          currentSubcategory
        );
        suggestedListCategory = inferExecutariListCategory(title, description, currentListCategory, suggestedSubcategory);
      }

      const mismatch =
        normalizeText(currentCategory) !== normalizeText(suggestedCategory) ||
        normalizeText(currentSubcategory) !== normalizeText(suggestedSubcategory) ||
        (isLicitatiiPublice && suggestedListCategory
          ? normalizeText(currentListCategory) !== normalizeText(suggestedListCategory)
          : false);

      logs.push(
        `[${suggested.engine.toUpperCase()}] ${title.slice(0, 90)} -> ${suggestedCategory}/${suggestedSubcategory}${
          isLicitatiiPublice && suggestedListCategory ? ` [${suggestedListCategory}]` : ""
        } (${Math.round(
          suggested.confidence * 100
        )}%) ${mismatch ? "MISMATCH" : "OK"}`
      );

      if (!onlyMismatched || mismatch) {
        rows.push({
          productId: String((p as any).id),
          slug: String((p as any).slug || "").trim() || undefined,
          announcementUrl: buildAnnouncementUrl(p),
          announcementCode: getAnnouncementCode(p),
          title,
          isLicitatiiPublice,
          currentCategory,
          currentSubcategory,
          currentListCategory,
          suggestedCategory,
          suggestedSubcategory,
          suggestedListCategory,
          confidence: Number(suggested.confidence.toFixed(2)),
          engine: suggested.engine,
          mismatch,
          city,
          inferredLocation: locationGuess.inferredLocation,
          locationSource: locationGuess.source,
          locationConfidence: Number(locationGuess.confidence.toFixed(2)),
        });
      }

      const bucketKey = `${suggestedCategory}__${suggestedSubcategory}`;
      if (!keywordBuckets.has(bucketKey)) keywordBuckets.set(bucketKey, new Map<string, number>());
      const bucket = keywordBuckets.get(bucketKey)!;
      for (const kw of extractTitleKeywords(title)) {
        bucket.set(kw, (bucket.get(kw) || 0) + 1);
      }

      // Signals for "new category/subcategory" proposals
      const shouldMineUnknown =
        mismatch ||
        suggestedCategory === "diverse" ||
        suggested.confidence < 0.65 ||
        normalizeText(currentCategory) === "all";
      if (shouldMineUnknown) {
        const allKw = extractKeywordsFromText(`${title} ${description}`, 18);
        allKw.forEach((kw, i) => {
          unknownTokenBuckets.set(kw, (unknownTokenBuckets.get(kw) || 0) + 1);
          if (i < allKw.length - 1) {
            const phrase = `${kw} ${allKw[i + 1]}`;
            if (!STOP_WORDS.has(allKw[i + 1])) {
              unknownPhraseBuckets.set(phrase, (unknownPhraseBuckets.get(phrase) || 0) + 1);
            }
          }
        });
      }
    }

    const groupedRecommendations = Object.values(
      rows.reduce<Record<string, { categorySlug: string; categoryLabel: string; count: number }>>((acc, row) => {
        const key = row.suggestedCategory;
        if (!acc[key]) {
          acc[key] = {
            categorySlug: key,
            categoryLabel: toDisplayCategory(key),
            count: 0,
          };
        }
        acc[key].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.count - a.count);

    const filterSuggestions = Array.from(keywordBuckets.entries())
      .map(([key, map]) => {
        const [categorySlug, subcategorySlug] = key.split("__");
        const suggestions = Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, count]) => ({ value, count }));
        return {
          categorySlug,
          categoryLabel: toDisplayCategory(categorySlug),
          subcategorySlug,
          subcategoryLabel: toDisplaySubcategory(subcategorySlug),
          suggestions,
        };
      })
      .filter((x) => x.suggestions.length > 0)
      .sort((a, b) => b.suggestions[0].count - a.suggestions[0].count)
      .slice(0, 20);

    const topUnknownPhrases = Array.from(unknownPhraseBuckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
    const topUnknownTokens = Array.from(unknownTokenBuckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);

    const newCategoryCandidates: NewCategoryCandidate[] = [];

    for (const [phrase, hits] of topUnknownPhrases.slice(0, 10)) {
      if (hits < 2) continue;
      const intents = inferIntentCategoriesFromQuery(phrase);
      const parent = intents[0]?.categorySlug;
      if (parent && parent !== "all" && RO_CATEGORIES[parent]) {
        newCategoryCandidates.push({
          proposedType: "subcategory",
          name: phrase,
          parentCategorySlug: parent,
          parentCategoryLabel: toDisplayCategory(parent),
          hits,
          evidence: topUnknownTokens.slice(0, 5).map(([k]) => k),
          reason: `Fraza apare recurent în titluri/descriptions și nu există explicit în subcategoriile curente.`,
        });
      }
    }

    const diverseHeavy = rows.filter((r) => r.suggestedCategory === "diverse").length;
    if (diverseHeavy >= 8) {
      for (const [token, hits] of topUnknownTokens.slice(0, 6)) {
        if (hits < 3) continue;
        newCategoryCandidates.push({
          proposedType: "category",
          name: token.charAt(0).toUpperCase() + token.slice(1),
          hits,
          evidence: topUnknownPhrases.slice(0, 4).map(([p]) => p),
          reason: `Multe produse sunt împinse în "diverse"; tokenul "${token}" apare frecvent și indică posibilă categorie nouă.`,
        });
      }
    }

    const dedupedCandidates = newCategoryCandidates
      .reduce<NewCategoryCandidate[]>((acc, item) => {
        const key = `${item.proposedType}-${normalizeText(item.name)}-${item.parentCategorySlug || "none"}`;
        if (!acc.some((x) => `${x.proposedType}-${normalizeText(x.name)}-${x.parentCategorySlug || "none"}` === key)) {
          acc.push(item);
        }
        return acc;
      }, [])
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 16);

    const scanned = (products || []).length;
    const hasMore = scanned === limit;
    const mismatchedCount = rows.filter((r) => r.mismatch).length;
    const locationInferredCount = rows.filter((r) => r.locationSource === "description").length;

    const optimizationIdeas: OptimizationIdea[] = [
      {
        priority: mismatchedCount > Math.max(10, Math.floor(scanned * 0.35)) ? "high" : "medium",
        title: "Activează review automat pe confidence mare",
        details:
          "Aplică direct modificările cu confidence >= 0.85 și păstrează review manual pentru restul; reduce timpul de curățare categorie.",
      },
      {
        priority: locationInferredCount > 0 ? "high" : "low",
        title: "Completează locația din descriere",
        details:
          locationInferredCount > 0
            ? `S-au detectat ${locationInferredCount} produse cu locație extrasă din descriere; merită completare automată câmp city/product_location.`
            : "Nu sunt suficiente semnale de adresă în descrieri pentru autofill locație.",
      },
      {
        priority: dedupedCandidates.length > 0 ? "medium" : "low",
        title: "Testează categorii/subcategorii noi propuse",
        details:
          dedupedCandidates.length > 0
            ? `Există ${dedupedCandidates.length} propuneri noi; creează întâi 1-2 subcategorii pilot și monitorizează reducerea mismatch-ului.`
            : "Nu au fost detectate propuneri puternice în batch-ul curent.",
      },
    ];

    return NextResponse.json({
      success: true,
      meta: {
        scanned,
        offset,
        limit,
        mode,
        listingScope,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
      totals: {
        liveBid: Number(totalLiveBid || 0),
        licitatiiPublice: Number(totalLicitatiiPublice || 0),
      },
      summary: {
        mismatchedCount,
        matchedCount: scanned - mismatchedCount,
        mismatchRate: scanned > 0 ? Number(((mismatchedCount / scanned) * 100).toFixed(1)) : 0,
        locationInferredCount,
      },
      rows,
      logs,
      groupedRecommendations,
      filterSuggestions,
      newCategoryCandidates: dedupedCandidates,
      optimizationIdeas,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

