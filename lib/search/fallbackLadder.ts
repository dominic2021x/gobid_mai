/**
 * Fallback ladder for search: "cât mai precis dar niciodată gol"
 * Relaxes constraints in order: strict → relax terms → relax category → relax location → brand-only → latest.
 */

export type LocationMode = "strict" | "nearby" | "all";
export type SearchMode =
  | "exact"
  | "relaxed_terms"
  | "relaxed_category"
  | "relaxed_location"
  | "fallback_brand"
  | "fallback_latest";

export interface ReasonFlags {
  locationExpanded: boolean;
  categoryExpanded: boolean;
  termsReduced: boolean;
}

export interface SearchScenario {
  locationMode: LocationMode;
  categoryKey: string;
  subcategoryKey: string;
  /** Query step for term matching (empty = no term filter, show latest) */
  tokenStep: string;
  mode: SearchMode;
  reasonFlags: ReasonFlags;
}

/** One section of results (one scenario); label is for "Te-ar putea interesa" bar */
export interface LadderSection<T = unknown> {
  scenario: SearchScenario;
  label: string;
  items: T[];
}

/** Subcategory → parent category (group) for siblings */
const SUBGROUP_BY_SUBCATEGORY: Record<string, string> = {};
/** Category → subcategory keys (siblings) */
const SIBLINGS_BY_CATEGORY: Record<string, string[]> = {
  all: [],
  imobiliare: [
    "apartamente",
    "case-vile",
    "terenuri-intravilane",
    "terenuri-agricole",
    "spatii-comerciale",
    "hale-industriale",
    "proprietati-turistice",
  ],
  executari: [
    "exec-imobiliare",
    "exec-autovehicule",
    "exec-industrial",
    "exec-afaceri",
    "exec-office",
    "exec-altele",
  ],
  autovehicule: [
    "autoturisme",
    "suv-4x4",
    "motociclete",
    "camioane",
    "remorci",
    "autorulote",
    "vehicule-electrice",
    "piese-auto",
  ],
  utilaje: [
    "utilaje-constructii",
    "utilaje-agricole",
    "echipamente-forestiere",
    "generatoare",
    "scule-profesionale",
    "echipamente-ateliere",
    "echipamente-electrice",
  ],
  arta: [
    "picturi",
    "sculpturi",
    "bijuterii",
    "obiecte-colectie",
    "mobilier-epoca",
    "carti-rare",
    "fotografie-artistica",
    "licitatii-caritabile",
  ],
  electronice: [
    "laptopuri-pc",
    "telefoane",
    "tablete",
    "tv-audio",
    "console-jocuri",
    "drone-gadgeturi",
    "echipamente-foto",
  ],
  casa: [
    "mobilier-interior",
    "mobilier-exterior",
    "echipamente-gradinarit",
    "decoratiuni",
    "electrocasnice",
  ],
  moda: [
    "haine-designer",
    "incaltaminte",
    "genti-accesorii",
    "parfumuri-cosmetice",
    "ceasuri-lux",
  ],
  "mama-copil": [
    "haine-copil",
    "incaltaminte-copil",
    "jucarii",
    "mobilier-copil",
    "cosul-copilului",
    "ingrijire-bebelusi",
    "scaune-auto-copil",
    "carucioare",
    "hranire-copil",
  ],
  agricultura: [
    "tractoare-combine",
    "remorci-agricole",
    "echipamente-irigatii",
    "animale",
    "seminte-furaje",
  ],
  maritime: ["barci-iahturi", "motoare-marine", "avioane", "drone-industriale"],
  business: [
    "echipamente-birou",
    "mobilier-comercial",
    "calculatoare-second",
    "lichidari-firme",
    "loturi-stocuri",
  ],
  materiale: [
    "ciment-caramida",
    "materiale-izolatie",
    "feronerie-unelte",
    "usi-ferestre",
  ],
  diverse: [
    "caritabile",
    "militare-istorice",
    "nft-arta-digitala",
    "colectii-private",
    "bunuri-confiscate",
  ],
};

const NEARBY_LOCATIONS: Record<string, string[]> = {
  craiova: ['filiasi', 'bailesti', 'calafat', 'caracal', 'slatina'],
  bucuresti: ['voluntari', 'otopeni', 'chitila', 'popesti leordeni', 'pantelimon'],
  cluj: ['floresti', 'turda', 'dej', 'gherla'],
  timisoara: ['lugoj', 'dumbravita', 'sannicolau mare', 'jimbolia'],
  iasi: ['pascani', 'targu frumos', 'harlau', 'podu iloaiei'],
  constanta: ['navodari', 'mangalia', 'medgidia', 'eforie'],
  brasov: ['sfantu gheorghe', 'rasnov', 'fagaras', 'codlea'],
  sibiu: ['medias', 'cisnadie', 'avrig'],
  oradea: ['salonta', 'marghita', 'beius'],
};

function normalizeLocationValue(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearbyLocation(selectedLocation: string, auctionLocation: string): boolean {
  const selectedNorm = normalizeLocationValue(selectedLocation);
  const auctionNorm = normalizeLocationValue(auctionLocation);
  if (!selectedNorm || !auctionNorm) return false;
  if (selectedNorm === auctionNorm) return true;

  const nearby = NEARBY_LOCATIONS[selectedNorm] || [];
  if (nearby.includes(auctionNorm)) return true;

  // fallback: soft nearby by shared first 4 letters (helps unknown cities without explicit map)
  if (selectedNorm.length >= 4 && auctionNorm.length >= 4) {
    return selectedNorm.slice(0, 4) === auctionNorm.slice(0, 4);
  }
  return false;
}

// Build SUBGROUP_BY_SUBCATEGORY from SIBLINGS_BY_CATEGORY
Object.entries(SIBLINGS_BY_CATEGORY).forEach(([cat, subs]) => {
  subs.forEach((sub) => {
    SUBGROUP_BY_SUBCATEGORY[sub] = cat;
  });
});

/** Get sibling subcategory keys (same parent), excluding current */
export function getSiblingSubcategories(subcategoryKey: string): string[] {
  const parent = SUBGROUP_BY_SUBCATEGORY[subcategoryKey];
  if (!parent) return [];
  const siblings = SIBLINGS_BY_CATEGORY[parent] || [];
  return siblings.filter((s) => s !== subcategoryKey);
}

/** Get parent category for a subcategory */
export function getParentCategory(subcategoryKey: string): string | null {
  return SUBGROUP_BY_SUBCATEGORY[subcategoryKey] ?? null;
}

/** Progressive token steps: full query → core (without stop words) → brand/core only */
export function buildTokenSteps(query: string): string[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  const steps: string[] = [q];
  // Remove common stop words for "core" step
  const stopWords = new Set([
    "si",
    "și",
    "de",
    "la",
    "cu",
    "pentru",
    "din",
    "in",
    "în",
    "un",
    "o",
    "masina",
    "mașina",
    "masină",
    "auto",
    "anunț",
    "anunt",
  ]);
  const words = q.split(/\s+/).filter((w) => w.length >= 2 && !stopWords.has(w));
  if (words.length > 1) {
    const coreOnly = words.join(" ");
    if (coreOnly !== q) steps.push(coreOnly);
  }
  if (words.length > 0) {
    const firstWord = words[0];
    if (firstWord.length >= 2 && !steps.includes(firstWord)) steps.push(firstWord);
  }
  return [...new Set(steps)];
}

export interface LadderFilters {
  location: string;
  categoryKey: string;
  subcategoryKey: string;
  /** Full search query */
  query: string;
  /** All search terms (e.g. from searchAnalysis.allSearchTerms) */
  allSearchTerms?: string[];
}

/**
 * Build ordered scenarios for the fallback ladder.
 * Order: strict → relax terms → relax category (siblings) → relax location → relax category+location → brand-only → latest.
 */
export function buildScenarios(filters: LadderFilters): SearchScenario[] {
  const {
    location,
    categoryKey,
    subcategoryKey,
    query,
    allSearchTerms = [],
  } = filters;

  const tokenSteps = query.trim()
    ? buildTokenSteps(query)
    : [""];
  const hasLocation = location && location !== "all";
  const hasCategory = categoryKey && categoryKey !== "all";
  const hasSubcategory = subcategoryKey && subcategoryKey !== "all";

  const scenarios: SearchScenario[] = [];

  // 1) Strict: location + category + subcategory + best term step
  if (hasLocation || hasCategory || tokenSteps[0]) {
    scenarios.push({
      locationMode: hasLocation ? "strict" : "all",
      categoryKey: categoryKey || "all",
      subcategoryKey: subcategoryKey || "all",
      tokenStep: tokenSteps[0] || "",
      mode: "exact",
      reasonFlags: {
        locationExpanded: false,
        categoryExpanded: false,
        termsReduced: false,
      },
    });
  }

  // 2) Relax terms only (same location + category, shorter query)
  for (let i = 1; i < tokenSteps.length; i++) {
    scenarios.push({
      locationMode: hasLocation ? "strict" : "all",
      categoryKey: categoryKey || "all",
      subcategoryKey: subcategoryKey || "all",
      tokenStep: tokenSteps[i],
      mode: "relaxed_terms",
      reasonFlags: {
        locationExpanded: false,
        categoryExpanded: false,
        termsReduced: true,
      },
    });
  }

  // 3) Relax category: same location, siblings (e.g. autoturisme → piese-auto)
  if (hasSubcategory && hasCategory) {
    const siblings = getSiblingSubcategories(subcategoryKey);
    for (const sib of siblings) {
      scenarios.push({
        locationMode: hasLocation ? "strict" : "all",
        categoryKey,
        subcategoryKey: sib,
        tokenStep: tokenSteps[0] || "",
        mode: "relaxed_category",
        reasonFlags: {
          locationExpanded: false,
          categoryExpanded: true,
          termsReduced: false,
        },
      });
    }
    // Same location, parent category (all subcategories)
    scenarios.push({
      locationMode: hasLocation ? "strict" : "all",
      categoryKey,
      subcategoryKey: "all",
      tokenStep: tokenSteps[0] || "",
      mode: "relaxed_category",
      reasonFlags: {
        locationExpanded: false,
        categoryExpanded: true,
        termsReduced: false,
      },
    });
  }

  // 4) Relax location: all locations, same category + terms
  if (hasLocation && (hasCategory || tokenSteps[0])) {
    scenarios.push({
      locationMode: "nearby",
      categoryKey: categoryKey || "all",
      subcategoryKey: subcategoryKey || "all",
      tokenStep: tokenSteps[0] || "",
      mode: "relaxed_location",
      reasonFlags: {
        locationExpanded: true,
        categoryExpanded: false,
        termsReduced: false,
      },
    });
  }

  // 5) Relax location: all locations, same category + terms
  if (hasLocation && (hasCategory || tokenSteps[0])) {
    scenarios.push({
      locationMode: "all",
      categoryKey: categoryKey || "all",
      subcategoryKey: subcategoryKey || "all",
      tokenStep: tokenSteps[0] || "",
      mode: "relaxed_location",
      reasonFlags: {
        locationExpanded: true,
        categoryExpanded: false,
        termsReduced: false,
      },
    });
  }

  // 6) Relax location + category: nearby locations, siblings/parent
  if (hasLocation && hasSubcategory) {
    const siblings = getSiblingSubcategories(subcategoryKey);
    for (const sib of siblings) {
      scenarios.push({
        locationMode: "nearby",
        categoryKey,
        subcategoryKey: sib,
        tokenStep: tokenSteps[0] || "",
        mode: "relaxed_category",
        reasonFlags: {
          locationExpanded: true,
          categoryExpanded: true,
          termsReduced: false,
        },
      });
    }
    scenarios.push({
      locationMode: "nearby",
      categoryKey,
      subcategoryKey: "all",
      tokenStep: tokenSteps[0] || "",
      mode: "relaxed_category",
      reasonFlags: {
        locationExpanded: true,
        categoryExpanded: true,
        termsReduced: false,
      },
    });
  }

  // 7) Relax location + category: all locations, siblings/parent
  if (hasLocation && hasSubcategory) {
    const siblings = getSiblingSubcategories(subcategoryKey);
    for (const sib of siblings) {
      scenarios.push({
        locationMode: "all",
        categoryKey,
        subcategoryKey: sib,
        tokenStep: tokenSteps[0] || "",
        mode: "relaxed_category",
        reasonFlags: {
          locationExpanded: true,
          categoryExpanded: true,
          termsReduced: false,
        },
      });
    }
    scenarios.push({
      locationMode: "all",
      categoryKey,
      subcategoryKey: "all",
      tokenStep: tokenSteps[0] || "",
      mode: "relaxed_category",
      reasonFlags: {
        locationExpanded: true,
        categoryExpanded: true,
        termsReduced: false,
      },
    });
  }

  // 8) Brand-only: all locations, category, first token only
  if (tokenSteps.length > 0 && tokenSteps[tokenSteps.length - 1]) {
    scenarios.push({
      locationMode: "all",
      categoryKey: categoryKey || "all",
      subcategoryKey: subcategoryKey || "all",
      tokenStep: tokenSteps[tokenSteps.length - 1],
      mode: "fallback_brand",
      reasonFlags: {
        locationExpanded: !!hasLocation,
        categoryExpanded: false,
        termsReduced: true,
      },
    });
  }

  // 9) Final: all locations, category only (or all), no term filter – trending/latest
  scenarios.push({
    locationMode: "all",
    categoryKey: categoryKey || "all",
    subcategoryKey: subcategoryKey || "all",
    tokenStep: "",
    mode: "fallback_latest",
    reasonFlags: {
      locationExpanded: !!hasLocation,
      categoryExpanded: false,
      termsReduced: true,
    },
  });

  return scenarios;
}

/**
 * Label for "Te-ar putea interesa" bar before a section (used on /ro results).
 * First section (exact) uses no bar; subsequent sections get a short phrase.
 */
export function getScenarioSectionLabel(
  scenario: SearchScenario,
  _filters: LadderFilters
): string {
  switch (scenario.mode) {
    case "exact":
      return ""; // first section, no bar
    case "relaxed_terms":
      return "termeni mai generali";
    case "relaxed_category":
      return scenario.subcategoryKey === "all"
        ? ""
        : "din aceeași subcategorie";
    case "relaxed_location":
      return scenario.locationMode === "nearby" ? "din localități apropiate" : "din alte locații";
    case "fallback_brand":
      return "din același brand";
    case "fallback_latest":
      return "";
    default:
      return "te-ar putea interesa";
  }
}

/** Normalize for search (lowercase, no diacritics for matching) */
function normalizeForSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function normalizeSubcategoryKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[ăâîșț]/g, (c) => ({ ă: "a", â: "a", î: "i", ș: "s", ț: "t" }[c] || c))
    .replace(/\s+/g, "-")
    .replace(/-si-|-și-/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isInsolventaAuction(auction: { [key: string]: unknown }): boolean {
  const productType = String((auction as any).productType ?? (auction as any).product_type ?? "").toLowerCase();
  const saleType = String((auction as any).saleType ?? (auction as any).sale_type ?? "").toLowerCase();
  return productType === "licitatii-publice" || saleType === "licitatii-insolventa" || saleType === "licitatie-publica";
}

function deriveLinkedCategoryForInsolventa(auction: { [key: string]: unknown }): string {
  const sub = normalizeSubcategoryKey(String(auction.subcategory ?? ""));
  const main = normalizeForSearch(String((auction as any).main_category ?? ""));
  const list = normalizeForSearch(String((auction as any).list_category ?? ""));
  const full = `${sub} ${main} ${list}`;
  if (sub === "exec-imobiliare" || /\b(imobil|apartament|casa|teren|spatiu)\b/.test(full)) return "imobiliare";
  if (sub === "exec-autovehicule" || /\b(auto|autoturism|vehicul|camion|motocic)\b/.test(full)) return "autovehicule";
  if (sub === "exec-industrial" || /\b(utilaj|industrial|echipament|tractor|excavator)\b/.test(full)) return "utilaje";
  if (sub === "exec-afaceri" || sub === "exec-office" || /\b(afaceri|office|stoc|firma|lichidare)\b/.test(full)) return "business";
  return "diverse";
}

function deriveSyntheticSubcategory(linkedCategory: string): string {
  if (linkedCategory === "imobiliare") return "apartamente";
  if (linkedCategory === "autovehicule") return "autoturisme";
  if (linkedCategory === "utilaje") return "utilaje-constructii";
  if (linkedCategory === "business") return "lichidari-firme";
  return "colectii-private";
}

/** Verifică dacă auction se potrivește cu locația (city, county sau location – ca RoPageClient.auctionMatchesLocation) */
function auctionMatchesLocation(
  auction: { city?: string; county?: string; location?: string; [key: string]: unknown },
  selectedLoc: string
): boolean {
  if (!selectedLoc?.trim()) return true;
  const norm = normalizeForSearch(selectedLoc.trim());
  const aCity = normalizeForSearch(String(auction.city ?? "").trim());
  const aCounty = normalizeForSearch(String(auction.county ?? "").trim());
  const aLoc = normalizeForSearch(String(auction.location ?? "").trim());
  return (
    aCity === norm ||
    aCounty === norm ||
    aCity.includes(norm) ||
    aCounty.includes(norm) ||
    aLoc.includes(norm)
  );
}

/** Obține valoarea principală de locație din auction pentru nearby check */
function getAuctionLocationValue(auction: {
  city?: string;
  county?: string;
  location?: string;
  [key: string]: unknown;
}): string {
  const city = String(auction.city ?? "").trim();
  const county = String(auction.county ?? "").trim();
  const loc = String(auction.location ?? "").trim();
  return city || county || loc;
}

/**
 * Check if an auction matches a scenario (location + category + subcategory + token).
 * Used by the ro page to filter with the winning scenario.
 */
export function auctionMatchesScenario(
  auction: {
    location?: string;
    category?: string;
    subcategory?: string;
    title?: string;
    city?: string;
    county?: string;
    [key: string]: unknown;
  },
  scenario: SearchScenario,
  selectedLocation: string
): boolean {
  // Location – folosește city, county șI location (ca RoPageClient)
  if (scenario.locationMode === "strict" && selectedLocation && selectedLocation !== "all") {
    if (!auctionMatchesLocation(auction, selectedLocation)) return false;
  }
  if (scenario.locationMode === "nearby" && selectedLocation && selectedLocation !== "all") {
    const auctionLoc = getAuctionLocationValue(auction);
    if (!auctionLoc || !isNearbyLocation(selectedLocation, auctionLoc)) return false;
  }

  // Category
  if (scenario.categoryKey && scenario.categoryKey !== "all") {
    const cat = (auction.category || "").toString().toLowerCase();
    const catKey = scenario.categoryKey.toLowerCase();
    let categoryMatch = cat === catKey;
    const insolv = isInsolventaAuction(auction);
    if (!categoryMatch && catKey === "executari" && insolv) {
      categoryMatch = true;
    } else if (!categoryMatch && insolv && catKey !== "executari") {
      categoryMatch = deriveLinkedCategoryForInsolventa(auction) === catKey;
    }
    if (!categoryMatch) return false;
  }

  // Subcategory: match key exact sau prefix (ex: "piese-auto" match "piese-auto-accesorii" din DB)
  if (scenario.subcategoryKey && scenario.subcategoryKey !== "all") {
    let sub = normalizeSubcategoryKey(String(auction.subcategory || ""));
    const subKey = scenario.subcategoryKey.toLowerCase();
    let subMatch = sub === subKey || sub.startsWith(subKey + "-");
    if (!subMatch && isInsolventaAuction(auction) && scenario.categoryKey && scenario.categoryKey !== "executari") {
      const linkedCategory = deriveLinkedCategoryForInsolventa(auction);
      const synthetic = deriveSyntheticSubcategory(linkedCategory);
      subMatch = synthetic === subKey;
    }
    if (!subMatch) return false;
  }

  // Token (search term) — mai multe cuvinte: toate trebuie să apară (AND), ordine independentă (ca API / „bmw baterie” vs „baterie bmw”)
  if (scenario.tokenStep) {
    const normTitle = normalizeForSearch(String(auction.title ?? ""));
    const normDesc = normalizeForSearch(String(auction.description ?? ""));
    const normCat = normalizeForSearch(String(auction.category ?? ""));
    const normSub = normalizeForSearch(String(auction.subcategory ?? ""));
    const normBrand = normalizeForSearch(String((auction as any).brand ?? ""));
    const hay = `${normTitle} ${normDesc} ${normCat} ${normSub} ${normBrand}`;
    const parts = scenario.tokenStep
      .trim()
      .split(/\s+/)
      .map((p) => normalizeForSearch(p))
      .filter(Boolean);
    if (parts.length === 0) return true;
    if (!parts.every((term) => hay.includes(term))) return false;
  }

  return true;
}
