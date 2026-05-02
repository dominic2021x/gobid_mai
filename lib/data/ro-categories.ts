/**
 * Sursă unică pentru categoriile și subcategoriile afișate pe /ro și în admin (licitații publice).
 * Folosit pentru sincronizare: aceleași etichete, aceeași ordine în ambele locuri.
 */

import { MAIN_CATEGORIES_INSOLVENTA } from "@/lib/data/licitatii-insolventa-category-map";

/** Structură categorie: slug -> { name, subcategories[] } */
export type RoCategoryEntry = { name: string; subcategories: string[] };

/** Categorii pentru /ro – ordinea și subcategoriile sunt sursa de adevăr. */
export const RO_CATEGORIES: Record<string, RoCategoryEntry> = {
  "all": { name: "Toate categoriile", subcategories: [] },
  // Cele 6 categorii principale (licitații insolvență) + altele
  "imobiliare": {
    name: "Imobiliare",
    subcategories: [
      "apartamente",
      "case-vile",
      "terenuri",
      "spatii-comerciale",
      "hale-industriale",
      "proprietati-turistice",
    ],
  },
  "executari": {
    name: "Executări și Insolvență",
    subcategories: [
      "oferte-grupate",
      "utilaje-echipamente",
      "exec-imobiliare",
      "exec-autovehicule",
      "exec-industrial",
      "exec-afaceri",
      "exec-office",
      "exec-altele",
    ],
  },
  "autovehicule": {
    name: "Autovehicule",
    subcategories: [
      "autoturisme",
      "suv-4x4",
      "motociclete",
      "camioane",
      "remorci",
      "autorulote",
      "vehicule-electrice",
      "piese-auto",
    ],
  },
  "utilaje": {
    name: "Utilaje & Echipamente",
    subcategories: [
      "utilaje-constructii",
      "utilaje-agricole",
      "tractoare-combine",
      "echipamente-forestiere",
      "generatoare",
      "scule-profesionale",
      "echipamente-ateliere",
      "echipamente-electrice",
    ],
  },
  "electronice": {
    name: "Electronice & Tehnologie",
    subcategories: [
      "laptopuri-pc",
      "telefoane",
      "tablete",
      "tv-audio",
      "console-jocuri",
      "drone-gadgeturi",
      "echipamente-foto",
    ],
  },
  "diverse": {
    name: "Diverse / Speciale",
    subcategories: [
      "caritabile",
      "militare-istorice",
      "nft-arta-digitala",
      "colectii-private",
      "bunuri-confiscate",
    ],
  },
  "arta": {
    name: "Artă & Antichități",
    subcategories: [
      "picturi",
      "sculpturi",
      "bijuterii",
      "obiecte-colectie",
      "mobilier-epoca",
      "carti-rare",
      "fotografie-artistica",
      "licitatii-caritabile",
    ],
  },
  "casa": {
    name: "Mobilier & Casă",
    subcategories: [
      "mobilier-interior",
      "mobilier-exterior",
      "echipamente-gradinarit",
      "decoratiuni",
      "electrocasnice",
    ],
  },
  "moda": {
    name: "Modă & Lifestyle",
    subcategories: [
      "haine-designer",
      "incaltaminte",
      "genti-accesorii",
      "parfumuri-cosmetice",
      "ceasuri-lux",
    ],
  },
  "mama-copil": {
    name: "Mama și copilul",
    subcategories: [
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
  },
  "agricultura": {
    name: "Agricultură & Zootehnie",
    subcategories: [
      "tractoare-combine",
      "remorci-agricole",
      "echipamente-irigatii",
      "animale",
      "seminte-furaje",
    ],
  },
  "maritime": {
    name: "Maritime & Aeronautice",
    subcategories: [
      "barci-iahturi",
      "motoare-marine",
      "avioane",
      "drone-industriale",
    ],
  },
  "materiale": {
    name: "Materiale Construcții",
    subcategories: [
      "ciment-caramida",
      "materiale-izolatie",
      "feronerie-unelte",
      "usi-ferestre",
    ],
  },
};

/** Nume afișat pentru fiecare slug de subcategorie. */
export const RO_SUBCATEGORY_NAMES: Record<string, string> = {
  "apartamente": "Apartamente",
  "case-vile": "Case și vile",
  "terenuri": "Terenuri",
  "terenuri-intravilane": "Terenuri intravilane",
  "terenuri-extravilane": "Terenuri extravilane",
  "terenuri-agricole": "Terenuri agricole",
  "spatii-comerciale": "Spații comerciale",
  "hale-industriale": "Hale industriale",
  "proprietati-turistice": "Proprietăți turistice",
  "autoturisme": "Autoturisme",
  "suv-4x4": "SUV / 4x4",
  "motociclete": "Motociclete și scutere",
  "camioane": "Camioane",
  "remorci": "Remorci și semiremorci",
  "autorulote": "Autorulote / rulote",
  "vehicule-electrice": "Vehicule electrice",
  "piese-auto": "Piese auto și accesorii",
  "utilaje-constructii": "Utilaje construcții",
  "utilaje-agricole": "Utilaje agricole",
  "echipamente-forestiere": "Echipamente forestiere",
  "generatoare": "Generatoare și compresoare",
  "scule-profesionale": "Scule profesionale",
  "echipamente-ateliere": "Echipamente ateliere auto",
  "echipamente-electrice": "Echipamente electrice / sudură",
  "picturi": "Picturi",
  "sculpturi": "Sculpturi",
  "bijuterii": "Bijuterii și ceasuri",
  "obiecte-colectie": "Obiecte de colecție",
  "mobilier-epoca": "Mobilier de epocă",
  "carti-rare": "Cărți rare, hărți vechi",
  "fotografie-artistica": "Fotografie artistică",
  "licitatii-caritabile": "Licitații caritabile",
  "laptopuri-pc": "Laptopuri și PC-uri",
  "telefoane": "Telefoane mobile",
  "tablete": "Tablete",
  "tv-audio": "TV & Audio",
  "console-jocuri": "Console & jocuri",
  "drone-gadgeturi": "Drone & gadgeturi smart",
  "echipamente-foto": "Echipamente foto/video",
  "mobilier-interior": "Mobilier interior",
  "mobilier-exterior": "Mobilier exterior",
  "echipamente-gradinarit": "Echipamente de grădinărit",
  "decoratiuni": "Decorațiuni",
  "electrocasnice": "Electrocasnice",
  "haine-designer": "Haine de designer",
  "incaltaminte": "Încălțăminte",
  "genti-accesorii": "Genți & accesorii",
  "parfumuri-cosmetice": "Parfumuri & cosmetice",
  "ceasuri-lux": "Ceasuri de lux",
  "haine-copil": "Haine copil",
  "incaltaminte-copil": "Încălțăminte copil",
  "jucarii": "Jucării",
  "mobilier-copil": "Mobilier copil (patut, comodă)",
  "cosul-copilului": "Coșul copilului / puericultură",
  "ingrijire-bebelusi": "Îngrijire bebeluși",
  "scaune-auto-copil": "Scaune auto copil",
  "carucioare": "Cărucioare și accesorii",
  "hranire-copil": "Hranire (biberoane, etc.)",
  "tractoare-combine": "Tractoare, combine",
  "remorci-agricole": "Remorci agricole",
  "echipamente-irigatii": "Echipamente de irigații",
  "animale": "Animale",
  "seminte-furaje": "Semințe, furaje, îngrășăminte",
  "barci-iahturi": "Bărci, iahturi, skijeturi",
  "motoare-marine": "Motoare marine",
  "avioane": "Avioane mici / ultraușoare",
  "drone-industriale": "Dronuri industriale",
  "echipamente-birou": "Echipamente de birou",
  "mobilier-comercial": "Mobilier comercial",
  "calculatoare-second": "Calculatoare second-hand",
  "lichidari-firme": "Licitații lichidări firme",
  "loturi-stocuri": "Loturi stocuri produse",
  "ciment-caramida": "Ciment, cărămidă, oțel",
  "materiale-izolatie": "Materiale izolație",
  "feronerie-unelte": "Feronerie, unelte",
  "usi-ferestre": "Uși, ferestre, tâmplărie",
  "caritabile": "Licitații caritabile",
  "militare-istorice": "Obiecte militare / istorice",
  "nft-arta-digitala": "NFT / artă digitală",
  "colectii-private": "Colecții private",
  "bunuri-confiscate": "Bunuri confiscate / executări",
  "exec-imobiliare": "Imobiliare",
  "exec-autovehicule": "Autovehicule",
  "exec-industrial": "Industrial",
  "exec-afaceri": "Afaceri",
  "exec-office": "Office",
  "exec-altele": "Altele",
  "oferte-grupate": "Oferte grupate",
  "utilaje-echipamente": "Utilaje & Echipamente",
};

/**
 * Slug-uri pentru terenuri (intravilan / extravilan / agricol). Subcategoria este "terenuri", tipurile sunt level3.
 * Aliniat cu RO_CATEGORIES.imobiliare.subcategories și RO_LEVEL3_BY_SUBCATEGORY în lib/taxonomy/ro/taxonomy.
 * Extravilan ≠ agricol: extravilan = terenuri-extravilane; agricol doar când există termeni agricoli expliciti.
 */
export const RO_LAND_TAXONOMY = {
  category: "imobiliare",
  subcategory: "terenuri",
  level3Intravilan: "terenuri-intravilane",
  level3Extravilan: "terenuri-extravilane",
  level3Agricol: "terenuri-agricole",
  /** @deprecated Use level3Intravilan; kept for backward compat in rules. */
  subcategoryIntravilan: "terenuri-intravilane",
  /** @deprecated Use level3Extravilan. */
  subcategoryExtravilan: "terenuri-extravilane",
  /** @deprecated Use level3Agricol. */
  subcategoryAgricol: "terenuri-agricole",
} as const;

/** Mapare din MAIN_CATEGORIES_INSOLVENTA (display name) în slug folosit în RO_CATEGORIES. */
export const MAIN_CATEGORY_DISPLAY_TO_SLUG: Record<string, string> = {
  "Imobiliare": "imobiliare",
  "Executări și Insolvență": "executari",
  "Autovehicule": "autovehicule",
  "Utilaje & Echipamente": "utilaje",
  "Electronice & Tehnologie": "electronice",
  "Oferte grupate": "executari", // pe /ro e subcategorie sub executari
  "Diverse / Speciale": "diverse",
};

/**
 * Returnează subcategoriile pentru o categorie principală (din admin).
 * Folosește aceeași listă și ordine ca pe /ro.
 */
export function getSubcategoriesForMainCategory(
  mainCategoryDisplayName: string
): { slug: string; name: string }[] {
  const slug = MAIN_CATEGORY_DISPLAY_TO_SLUG[mainCategoryDisplayName];
  if (!slug) return [];
  const entry = RO_CATEGORIES[slug];
  if (!entry) return [];
  return entry.subcategories.map((s) => ({
    slug: s,
    name: RO_SUBCATEGORY_NAMES[s] ?? s,
  }));
}

/** Ordinea categoriilor principale pentru afișare (același cu MAIN_CATEGORIES_INSOLVENTA). */
export const MAIN_CATEGORIES_ORDERED = [...MAIN_CATEGORIES_INSOLVENTA];

/**
 * Pentru filtre admin: când utilizatorul alege o subcategorie care corespunde unei categorii principale
 * (oferte-grupate, utilaje-echipamente), returnează acea categorie principală; altfel returnează mainCategory.
 * Pentru "Executări și Insolvență" păstrăm mereu această categorie (nu restrângem la Oferte grupate / Utilaje),
 * astfel încât selectarea unei subcategorii să nu facă lista să dispară (listările au main_category = "Executări și Insolvență").
 */
export function effectiveMainCategoryForFilter(
  mainCategoryDisplayName: string,
  subcategorySlug: string
): string {
  // La Executări și Insolvență nu restrângem după subcategorie – listările au main_category "Executări și Insolvență"
  if (mainCategoryDisplayName === "Executări și Insolvență") return "Executări și Insolvență";
  if (subcategorySlug === "oferte-grupate") return "Oferte grupate";
  if (subcategorySlug === "utilaje-echipamente") return "Utilaje & Echipamente";
  return mainCategoryDisplayName;
}

/** Categoria de top pentru pagina admin licitații publice (filtre) – Executări și Insolvență. */
export const FILTER_TOP_CATEGORY_EXECUTARI = "Executări și Insolvență";

/** Cat. principală pentru filtre (admin licitații publice) – ordinea ca în interfață. */
export const EXECUTARI_CAT_PRINCIPALA = [
  "Oferte grupate",
  "Utilaje & Echipamente",
  "Imobiliare",
  "Autovehicule",
  "Industrial",
  "Afaceri",
  "Office",
  "Altele",
] as const;

/** Subcategorii pentru filtre, pe Cat. principală (admin licitații publice). Valorile sunt etichete afișate și trimise la API ca category. */
export const EXECUTARI_SUBCATEGORII_BY_MAIN: Record<string, string[]> = {
  Imobiliare: [
    "Toate",
    "Active functionale",
    "Altele",
    "Anunturi selectie",
    "Apartamente si case",
    "Cladiri",
    "Hoteluri",
    "IT",
    "Marci inregistrate",
    "Pensiuni",
    "Proiecte imobiliare",
    "Proprietati industriale",
    "Spatii comerciale",
    "Spatii de birouri",
    "Stocuri",
    "Teren cu cladire",
    "Terenuri",
    "Vehicule Utilitare",
  ],
  "Oferte grupate": ["Toate"],
  "Utilaje & Echipamente": ["Toate"],
  Autovehicule: ["Toate"],
  Industrial: ["Toate"],
  Afaceri: ["Toate"],
  Office: ["Toate"],
  Altele: ["Toate"],
};

/**
 * Returnează opțiunile pentru dropdown-ul Subcategorie (al 3-lea filtru) în funcție de Cat. principală.
 * Pentru "Toate" nu trimitem category la API.
 */
export function getExecutariSubcategoriiForFilter(mainCategory: string): { value: string; label: string }[] {
  const list = EXECUTARI_SUBCATEGORII_BY_MAIN[mainCategory];
  if (!list || list.length === 0) return [];
  return list.map((name) => ({ value: name === "Toate" ? "" : name, label: name }));
}

/**
 * Mapare etichetă REPES (subcategorie din admin) → slug subcategorie /ro.
 * Folosit la publicare REPES ca anunțurile să apară și la categoria principală (Imobiliare, Autovehicule etc.),
 * la fel ca la Licitații publice (ex.: teren → Executări + Imobiliare > Terenuri).
 */
const REPES_LABEL_TO_RO_SUBCATEGORY_SLUG: Record<string, Record<string, string>> = {
  Imobiliare: {
    Terenuri: "terenuri-intravilane",
    "Teren cu cladire": "terenuri-intravilane",
    "Apartamente si case": "apartamente",
    "Spatii comerciale": "spatii-comerciale",
    "Spatii de birouri": "spatii-comerciale",
    Cladiri: "hale-industriale",
    "Proprietati industriale": "hale-industriale",
    Hoteluri: "proprietati-turistice",
    Pensiuni: "proprietati-turistice",
    "Proiecte imobiliare": "terenuri-intravilane",
    Stocuri: "spatii-comerciale",
    Altele: "apartamente",
    "Anunturi selectie": "apartamente",
    "Active functionale": "apartamente",
    "Marci inregistrate": "apartamente",
    IT: "spatii-comerciale",
    "Vehicule Utilitare": "hale-industriale",
  },
  "Utilaje & Echipamente": {
    Toate: "utilaje-constructii",
    Altele: "utilaje-constructii",
  },
  Autovehicule: {
    Toate: "autoturisme",
    Altele: "autoturisme",
  },
  "Electronice & Tehnologie": {
    Toate: "laptopuri-pc",
    Altele: "laptopuri-pc",
  },
  "Diverse / Speciale": {
    Toate: "bunuri-confiscate",
    Altele: "bunuri-confiscate",
  },
};

/**
 * Returnează slug-ul de subcategorie /ro pentru un anunț REPES (mainCategory + etichetă listing).
 * Fallback: prima subcategorie a categoriei principale pe /ro.
 */
export function getRoSubcategorySlugForRepes(mainCategory: string, repesCategoryLabel: string): string {
  const byMain = REPES_LABEL_TO_RO_SUBCATEGORY_SLUG[mainCategory];
  const label = (repesCategoryLabel || "").trim();
  if (byMain && label) {
    const slug = byMain[label] || byMain[label.toLowerCase()];
    if (slug) return slug;
  }
  const slug = MAIN_CATEGORY_DISPLAY_TO_SLUG[mainCategory];
  const entry = slug ? RO_CATEGORIES[slug] : null;
  const first = entry?.subcategories?.[0];
  return first ?? "bunuri-confiscate";
}

/**
 * Pentru publicare REPES: category + subcategory pentru produs (ca la Licitații publice).
 * Anunțul apare și la Executări și Insolvență (via sale_type) și la categoria principală (Imobiliare, Autovehicule etc.).
 */
export function getRoCategoryAndSubcategoryForRepes(
  mainCategory: string,
  repesCategoryLabel: string
): { category: string; subcategory: string } {
  const roSlug = MAIN_CATEGORY_DISPLAY_TO_SLUG[mainCategory];
  // Categorii care au pagină pe /ro (Imobiliare, Autovehicule, Utilaje, Electronice, Diverse)
  if (roSlug && roSlug !== "executari") {
    return {
      category: mainCategory,
      subcategory: getRoSubcategorySlugForRepes(mainCategory, repesCategoryLabel),
    };
  }
  // Oferte grupate, Industrial, Afaceri, Office, Altele → rămân doar la Executări
  const executariSubs = RO_CATEGORIES.executari?.subcategories ?? [];
  const map: Record<string, string> = {
    "Oferte grupate": "oferte-grupate",
    "Utilaje & Echipamente": "utilaje-echipamente",
    Imobiliare: "exec-imobiliare",
    Autovehicule: "exec-autovehicule",
    Industrial: "exec-industrial",
    Afaceri: "exec-afaceri",
    Office: "exec-office",
    Altele: "exec-altele",
  };
  const sub = map[mainCategory] && executariSubs.includes(map[mainCategory]) ? map[mainCategory] : "exec-altele";
  return { category: "Executări și Insolvență", subcategory: sub };
}
