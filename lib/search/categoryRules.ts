/**
 * Category rules: infer category from tokens, intent detection (car vs parts).
 * Returns ordered category slugs to try (e.g. parts first for "bara spate").
 */

import { tokenize } from './normalize';

/** Car intent: mașină, auto, km, an, diesel, benzină, cai, cp */
const CAR_INTENT_WORDS = new Set([
  'masina', 'masini', 'auto', 'autoturism', 'autoturisme', 'km', 'an', 'diesel', 'benzina', 'benzină',
  'cai', 'cp', 'motor', 'cutie', 'automata', 'manuala', 'suv', 'sedan', 'hatchback', 'break',
  'electrica', 'hibrid', 'dacia', 'bmw', 'mercedes', 'audi', 'vw', 'volkswagen', 'ford', 'opel',
]);

/** Parts intent: bara, far, ambreiaj, turbină, radiator, disc, plăcute, capotă, aripă */
const PARTS_INTENT_WORDS = new Set([
  'bara', 'bari', 'far', 'fari', 'faruri', 'ambreiaj', 'ambreiaj', 'turbina', 'turbina', 'radiator',
  'disc', 'discuri', 'placute', 'plăcute', 'capota', 'capotă', 'aripa', 'aripi', 'oglinda', 'oglinzi',
  'parbriz', 'geam', 'geamuri', 'bloc', 'transmisie', 'cutie', 'roata', 'roți', 'janta', 'jante',
  'amortizor', 'amortizoare', 'cardan', 'etrier', 'etriere', 'frane', 'filtru', 'filtre', 'bujii',
  'distributie', 'distribuție', 'alternator', 'baterie', 'piese', 'piesa', 'piese-auto',
]);

/** Real estate / imobiliare */
const REAL_ESTATE_WORDS = new Set([
  'apartament', 'apartamente', 'casa', 'casă', 'case', 'vila', 'vilă', 'vile', 'teren', 'terenuri',
  'imobil', 'imobiliare', 'spatiu', 'spațiu', 'comercial', 'camere', 'mp', 'suprafata', 'suprafață',
  'terenuri-intravilane', 'terenuri-agricole', 'spatii-comerciale',
]);

/** Home / casa */
const HOME_WORDS = new Set([
  'mobilier', 'mobilă', 'canapea', 'dulap', 'pat', 'birou', 'scaun', 'electrocasnic', 'gradinarit',
  'decoratiuni', 'decoratiuni',
]);

/** Category slug -> display name (for suggestions) */
export const CATEGORY_DISPLAY: Record<string, string> = {
  imobiliare: 'Imobiliare',
  executari: 'Executări',
  autovehicule: 'Autovehicule',
  utilaje: 'Utilaje & Echipamente',
  arta: 'Artă & Antichități',
  electronice: 'Electronice & Tehnologie',
  casa: 'Casa & Grădină',
  moda: 'Modă & Lifestyle',
  'mama-copil': 'Mama și copilul',
  agricultura: 'Agricultură',
  maritime: 'Maritim',
  business: 'Afaceri',
  materiale: 'Materiale construcții',
  diverse: 'Diverse',
  all: 'Toate',
};

/** Subcategory -> parent category (same as fallbackLadder SUBGROUP_BY_SUBCATEGORY) */
export const SUBGROUP_BY_SUBCATEGORY: Record<string, string> = {
  apartamente: 'imobiliare', 'case-vile': 'imobiliare', 'terenuri-intravilane': 'imobiliare',
  'terenuri-agricole': 'imobiliare', 'spatii-comerciale': 'imobiliare', 'hale-industriale': 'imobiliare',
  'proprietati-turistice': 'imobiliare',
  'exec-imobiliare': 'executari', 'exec-autovehicule': 'executari', 'exec-industrial': 'executari',
  'exec-afaceri': 'executari', 'exec-office': 'executari', 'exec-altele': 'executari',
  autoturisme: 'autovehicule', 'suv-4x4': 'autovehicule', motociclete: 'autovehicule',
  camioane: 'autovehicule', remorci: 'autovehicule', autorulote: 'autovehicule',
  'vehicule-electrice': 'autovehicule', 'piese-auto': 'autovehicule',
  'utilaje-constructii': 'utilaje', 'utilaje-agricole': 'utilaje', 'echipamente-forestiere': 'utilaje',
  generatoare: 'utilaje', 'scule-profesionale': 'utilaje', 'echipamente-ateliere': 'utilaje',
  'echipamente-electrice': 'utilaje',
  picturi: 'arta', sculpturi: 'arta', bijuterii: 'arta', 'obiecte-colectie': 'arta',
  'mobilier-epoca': 'arta', 'carti-rare': 'arta', 'fotografie-artistica': 'arta', 'licitatii-caritabile': 'arta',
  'laptopuri-pc': 'electronice', telefoane: 'electronice', tablete: 'electronice', 'tv-audio': 'electronice',
  'console-jocuri': 'electronice', 'drone-gadgeturi': 'electronice', 'echipamente-foto': 'electronice',
  'mobilier-interior': 'casa', 'mobilier-exterior': 'casa', 'echipamente-gradinarit': 'casa',
  decoratiuni: 'casa', electrocasnice: 'casa',
  'haine-designer': 'moda', incaltaminte: 'moda', 'genti-accesorii': 'moda', 'parfumuri-cosmetice': 'moda',
  'ceasuri-lux': 'moda',
  'haine-copil': 'mama-copil', 'incaltaminte-copil': 'mama-copil', jucarii: 'mama-copil',
  'mobilier-copil': 'mama-copil', 'cosul-copilului': 'mama-copil', 'ingrijire-bebelusi': 'mama-copil',
  'scaune-auto-copil': 'mama-copil', carucioare: 'mama-copil', 'hranire-copil': 'mama-copil',
  'tractoare-combine': 'agricultura', 'remorci-agricole': 'agricultura', 'echipamente-irigatii': 'agricultura',
  animale: 'agricultura', 'seminte-furaje': 'agricultura',
  'barci-iahturi': 'maritime', 'motoare-marine': 'maritime', avioane: 'maritime', 'drone-industriale': 'maritime',
  'echipamente-birou': 'business', 'mobilier-comercial': 'business', 'calculatoare-second': 'business',
  'lichidari-firme': 'business', 'loturi-stocuri': 'business',
  'ciment-caramida': 'materiale', 'materiale-izolatie': 'materiale', 'feronerie-unelte': 'materiale',
  'usi-ferestre': 'materiale',
  caritabile: 'diverse', 'militare-istorice': 'diverse', 'nft-arta-digitala': 'diverse',
  'colectii-private': 'diverse', 'bunuri-confiscate': 'diverse',
};

/** Siblings: category -> subcategory slugs */
export const SIBLINGS_BY_CATEGORY: Record<string, string[]> = {
  all: [],
  imobiliare: ['apartamente', 'case-vile', 'terenuri-intravilane', 'terenuri-agricole', 'spatii-comerciale', 'hale-industriale', 'proprietati-turistice'],
  executari: ['exec-imobiliare', 'exec-autovehicule', 'exec-industrial', 'exec-afaceri', 'exec-office', 'exec-altele'],
  autovehicule: ['autoturisme', 'suv-4x4', 'motociclete', 'camioane', 'remorci', 'autorulote', 'vehicule-electrice', 'piese-auto'],
  utilaje: ['utilaje-constructii', 'utilaje-agricole', 'echipamente-forestiere', 'generatoare', 'scule-profesionale', 'echipamente-ateliere', 'echipamente-electrice'],
  arta: ['picturi', 'sculpturi', 'bijuterii', 'obiecte-colectie', 'mobilier-epoca', 'carti-rare', 'fotografie-artistica', 'licitatii-caritabile'],
  electronice: ['laptopuri-pc', 'telefoane', 'tablete', 'tv-audio', 'console-jocuri', 'drone-gadgeturi', 'echipamente-foto'],
  casa: ['mobilier-interior', 'mobilier-exterior', 'echipamente-gradinarit', 'decoratiuni', 'electrocasnice'],
  moda: ['haine-designer', 'incaltaminte', 'genti-accesorii', 'parfumuri-cosmetice', 'ceasuri-lux'],
  'mama-copil': ['haine-copil', 'incaltaminte-copil', 'jucarii', 'mobilier-copil', 'cosul-copilului', 'ingrijire-bebelusi', 'scaune-auto-copil', 'carucioare', 'hranire-copil'],
  agricultura: ['tractoare-combine', 'remorci-agricole', 'echipamente-irigatii', 'animale', 'seminte-furaje'],
  maritime: ['barci-iahturi', 'motoare-marine', 'avioane', 'drone-industriale'],
  business: ['echipamente-birou', 'mobilier-comercial', 'calculatoare-second', 'lichidari-firme', 'loturi-stocuri'],
  materiale: ['ciment-caramida', 'materiale-izolatie', 'feronerie-unelte', 'usi-ferestre'],
  diverse: ['caritabile', 'militare-istorice', 'nft-arta-digitala', 'colectii-private', 'bunuri-confiscate'],
};

/** Infer intent from tokens: "parts" => try piese-auto first; "car" => autoturisme first; else category from words */
export function inferIntentCategories(tokens: string[]): { categorySlug: string; subcategorySlug: string }[] {
  const normalized = new Set(tokens.map((t) => t.toLowerCase()));
  const hasParts = tokens.some((t) => PARTS_INTENT_WORDS.has(t.toLowerCase()));
  const hasCar = tokens.some((t) => CAR_INTENT_WORDS.has(t.toLowerCase()));
  const hasRealEstate = tokens.some((t) => REAL_ESTATE_WORDS.has(t.toLowerCase()));
  const hasHome = tokens.some((t) => HOME_WORDS.has(t.toLowerCase()));

  const out: { categorySlug: string; subcategorySlug: string }[] = [];

  if (hasParts) {
    out.push({ categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' });
    out.push({ categorySlug: 'autovehicule', subcategorySlug: 'autoturisme' });
  }
  if (hasCar && !hasParts) {
    out.push({ categorySlug: 'autovehicule', subcategorySlug: 'autoturisme' });
    out.push({ categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' });
  }
  if (hasRealEstate) {
    out.push({ categorySlug: 'imobiliare', subcategorySlug: 'apartamente' });
    out.push({ categorySlug: 'imobiliare', subcategorySlug: 'case-vile' });
    out.push({ categorySlug: 'imobiliare', subcategorySlug: 'terenuri-intravilane' });
  }
  if (hasHome) {
    out.push({ categorySlug: 'casa', subcategorySlug: 'mobilier-interior' });
  }

  if (out.length === 0) {
    out.push({ categorySlug: 'all', subcategorySlug: 'all' });
  }
  return out;
}

/** From raw query string, return ordered list of { categorySlug, subcategorySlug } to try */
export function inferIntentCategoriesFromQuery(query: string): { categorySlug: string; subcategorySlug: string }[] {
  const tokens = tokenize(query);
  return inferIntentCategories(tokens);
}

/** Normalize for display matching (lowercase, no diacritics, collapse spaces/dashes) */
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, ' ')
    .trim();
}

/**
 * Map display names (from DB or UI) to category/subcategory slugs used on /ro.
 * So "Piese Auto și Accesorii", "Uși de mașină" -> piese-auto + autovehicule.
 */
export const DISPLAY_TO_SLUGS: Record<string, { categorySlug: string; subcategorySlug: string }> = {
  'piese auto': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'piese auto si accesorii': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'piese auto și accesorii': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'usi de masina': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'uși de mașină': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'usi masini': { categorySlug: 'autovehicule', subcategorySlug: 'piese-auto' },
  'case si vile': { categorySlug: 'imobiliare', subcategorySlug: 'case-vile' },
  'case și vile': { categorySlug: 'imobiliare', subcategorySlug: 'case-vile' },
  'case i vile': { categorySlug: 'imobiliare', subcategorySlug: 'case-vile' },
  apartamente: { categorySlug: 'imobiliare', subcategorySlug: 'apartamente' },
  terenuri: { categorySlug: 'imobiliare', subcategorySlug: 'terenuri-intravilane' },
  'telefoane mobile': { categorySlug: 'electronice', subcategorySlug: 'telefoane' },
  telefoane: { categorySlug: 'electronice', subcategorySlug: 'telefoane' },
  'genti accesorii': { categorySlug: 'moda', subcategorySlug: 'genti-accesorii' },
  'genți & accesorii': { categorySlug: 'moda', subcategorySlug: 'genti-accesorii' },
  'moda lifestyle': { categorySlug: 'moda', subcategorySlug: 'genti-accesorii' },
  imobiliare: { categorySlug: 'imobiliare', subcategorySlug: 'apartamente' },
  autovehicule: { categorySlug: 'autovehicule', subcategorySlug: 'autoturisme' },
  autoturisme: { categorySlug: 'autovehicule', subcategorySlug: 'autoturisme' },
  electronice: { categorySlug: 'electronice', subcategorySlug: 'telefoane' },
  'electronice tehnologie': { categorySlug: 'electronice', subcategorySlug: 'telefoane' },
  utilaje: { categorySlug: 'utilaje', subcategorySlug: 'utilaje-constructii' },
  'utilaje constructii': { categorySlug: 'utilaje', subcategorySlug: 'utilaje-constructii' },
  arta: { categorySlug: 'arta', subcategorySlug: 'picturi' },
  moda: { categorySlug: 'moda', subcategorySlug: 'genti-accesorii' },
  casa: { categorySlug: 'casa', subcategorySlug: 'mobilier-interior' },
  'mama copil': { categorySlug: 'mama-copil', subcategorySlug: 'jucarii' },
  bijuterii: { categorySlug: 'arta', subcategorySlug: 'bijuterii' },
  laptopuri: { categorySlug: 'electronice', subcategorySlug: 'laptopuri-pc' },
  mobilier: { categorySlug: 'casa', subcategorySlug: 'mobilier-interior' },
};

/** Get categorySlug + subcategorySlug for /ro redirect from display name(s). */
export function getSlugsForDisplay(
  display: string,
  categoryDisplay?: string,
  subcategoryDisplay?: string
): { categorySlug?: string; subcategorySlug?: string } {
  const n = norm(display);
  const direct = DISPLAY_TO_SLUGS[n];
  if (direct) return direct;
  const catNorm = categoryDisplay ? norm(categoryDisplay) : '';
  const subNorm = subcategoryDisplay ? norm(subcategoryDisplay) : '';
  const bySub = DISPLAY_TO_SLUGS[subNorm] || (subNorm ? DISPLAY_TO_SLUGS[subNorm.replace(/\s*&\s*/g, ' ')] : undefined);
  if (bySub) return bySub;
  const byCat = DISPLAY_TO_SLUGS[catNorm];
  if (byCat) return byCat;
  for (const [key, val] of Object.entries(CATEGORY_DISPLAY)) {
    if (norm(val) === n || key === n || key.replace(/-/g, ' ') === n) return { categorySlug: key, subcategorySlug: (SIBLINGS_BY_CATEGORY[key]?.[0]) ?? key };
  }
  for (const [subSlug, catSlug] of Object.entries(SUBGROUP_BY_SUBCATEGORY)) {
    if (subSlug === n || subSlug.replace(/-/g, ' ') === n) return { categorySlug: catSlug, subcategorySlug: subSlug };
  }
  return {};
}
