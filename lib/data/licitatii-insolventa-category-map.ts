/**
 * Mapare categorie sursă (licitatii_insolventa_listings.category) la
 * categorie centrală (display name) + subcategorie (slug) pentru products.
 * Folosit la "Publică pe site". Pentru valori necunoscute se folosește detect-category (AI).
 *
 * Cele 6 categorii principale (licitații insolvență / executori) pentru filtre în admin.
 */
import { SUBCATEGORY_DISPLAY_TO_KEY } from '@/lib/categories';

/** Cele 7 categorii principale – subcategoriile se grupează în acestea la filtre. Executări și Insolvență = o singură categorie mamă. */
export const MAIN_CATEGORIES_INSOLVENTA = [
  'Imobiliare',
  'Executări și Insolvență',
  'Autovehicule',
  'Utilaje & Echipamente',
  'Electronice & Tehnologie',
  'Oferte grupate',
  'Diverse / Speciale',
] as const;

export type MainCategoryInsolventa = (typeof MAIN_CATEGORIES_INSOLVENTA)[number];

/** Mapare din orice categorie rezolvată (din SOURCE_TO_RESOLVED) în una din cele 7 principale. */
const CATEGORY_TO_MAIN: Record<string, MainCategoryInsolventa> = {
  'Imobiliare': 'Imobiliare',
  'Executări': 'Executări și Insolvență',
  'Executări și Insolvență': 'Executări și Insolvență',
  'Autovehicule': 'Autovehicule',
  'Utilaje & Echipamente': 'Utilaje & Echipamente',
  'Electronice & Tehnologie': 'Electronice & Tehnologie',
  'Oferte grupate': 'Oferte grupate',
  'Diverse / Speciale': 'Diverse / Speciale',
  'Artă & Antichități': 'Diverse / Speciale',
  'Mobilier & Casă': 'Diverse / Speciale',
  'Modă & Lifestyle': 'Diverse / Speciale',
  'Mama și copilul': 'Diverse / Speciale',
  'Agricultură & Zootehnie': 'Utilaje & Echipamente',
  'Maritime & Aeronautice': 'Diverse / Speciale',
  'Business & Licitații': 'Diverse / Speciale',
  'Materiale Construcții': 'Utilaje & Echipamente',
};

/**
 * Returnează categoria principală (una din cele 6) pentru un listing.
 * Folosit pentru coloana main_category și filtre în admin.
 */
export function toMainCategory(resolvedCategoryName: string | null | undefined): MainCategoryInsolventa {
  const n = (resolvedCategoryName || '').trim();
  return (CATEGORY_TO_MAIN[n] ?? 'Diverse / Speciale');
}

export interface ResolvedCategory {
  /** Nume afișat al categoriei centrale (ex: Imobiliare, Autovehicule) */
  category: string;
  /** Slug subcategorie pentru filtre (ex: apartamente, autoturisme) */
  subcategory: string;
}

/** Normalizează pentru match: lowercase, fără diacritice, trim */
function norm(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Elimină tag-uri HTML și normalizează spațiile pentru text. */
function stripHtmlForDetection(htmlOrText: string | null | undefined): string {
  if (!htmlOrText) return '';
  return String(htmlOrText)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detectează dacă anunțul conține mai multe bunuri în același anunț (liste numerotate, mai multe prețuri pe linie).
 * Ex.: "1. Autovehicul DACIA LOGAN ... 2. Autovehicul ... 3. Buldoexcavator ..." sau "Mașină de cusut ... 2. Mașină ..."
 */
export function hasMultipleGoodsInAnnouncement(
  title?: string | null,
  descriptionHtmlOrText?: string | null
): boolean {
  const text = [title, stripHtmlForDetection(descriptionHtmlOrText)].filter(Boolean).join(' ');
  if (!text || text.length < 50) return false;
  // Listă numerotată: cel puțin 2 elemente de forma "1. ...", "2. ..."
  const numberedLines = text.match(/\d+\.\s+[A-Za-zĂÂÎȘȚăâîșț]/g);
  if (numberedLines && numberedLines.length >= 2) return true;
  // Mai multe prețuri tip "– X.XXX,00 EURO" sau "EURO exclusiv" pe linii separate (sugerează mai multe bunuri)
  const priceLines = text.match(/[\d.]{3,},\d{2}\s*(?:EURO|RON|lei)/gi);
  if (priceLines && priceLines.length >= 2) return true;
  return false;
}

/**
 * Mapare: key normalizat (fără diacritice, lowercase) -> ResolvedCategory.
 * Valorile din licitatii-insolventa.ro pot varia; includem variante frecvente.
 */
const SOURCE_TO_RESOLVED: Record<string, ResolvedCategory> = {
  // Imobiliare
  'imobiliare': { category: 'Imobiliare', subcategory: 'apartamente' },
  'apartamente': { category: 'Imobiliare', subcategory: 'apartamente' },
  'apartament': { category: 'Imobiliare', subcategory: 'apartamente' },
  'case si vile': { category: 'Imobiliare', subcategory: 'case-vile' },
  'case': { category: 'Imobiliare', subcategory: 'case-vile' },
  'vile': { category: 'Imobiliare', subcategory: 'case-vile' },
  'teren': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'teren cu cladire': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'teren si cladiri': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'teren si constructii': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'terenuri': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'terenuri intravilane': { category: 'Imobiliare', subcategory: 'terenuri-intravilane' },
  'terenuri agricole': { category: 'Imobiliare', subcategory: 'terenuri-agricole' },
  'spatii comerciale': { category: 'Imobiliare', subcategory: 'spatii-comerciale' },
  'hale industriale': { category: 'Imobiliare', subcategory: 'hale-industriale' },
  'proprietati turistice': { category: 'Imobiliare', subcategory: 'proprietati-turistice' },
  // Autovehicule (doar autoturisme, camioane, remorci – NU mașini/utilaje industriale)
  'autovehicule': { category: 'Autovehicule', subcategory: 'autoturisme' },
  'autoturisme': { category: 'Autovehicule', subcategory: 'autoturisme' },
  'autoturism': { category: 'Autovehicule', subcategory: 'autoturisme' },
  'masini': { category: 'Autovehicule', subcategory: 'autoturisme' }, // doar când e singur; "masini si utilaje" = Utilaje, nu Autovehicule
  // Masini si utilaje = categorie principală Utilaje & Echipamente (mașini-unelte, echipamente), NU autoturisme
  'masini de cusut': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-constructii' },
  'masini si utilaje': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-constructii' },
  'utilaje patiserie': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-constructii' },
  'suv': { category: 'Autovehicule', subcategory: 'suv-4x4' },
  '4x4': { category: 'Autovehicule', subcategory: 'suv-4x4' },
  'motociclete': { category: 'Autovehicule', subcategory: 'motociclete' },
  'scutere': { category: 'Autovehicule', subcategory: 'motociclete' },
  'camioane': { category: 'Autovehicule', subcategory: 'camioane' },
  'semiremorca': { category: 'Autovehicule', subcategory: 'camioane' },
  'remorca': { category: 'Autovehicule', subcategory: 'remorci' },
  'remorci': { category: 'Autovehicule', subcategory: 'remorci' },
  'autorulote': { category: 'Autovehicule', subcategory: 'autorulote' },
  'rulote': { category: 'Autovehicule', subcategory: 'autorulote' },
  'vehicule electrice': { category: 'Autovehicule', subcategory: 'vehicule-electrice' },
  'piese auto': { category: 'Autovehicule', subcategory: 'piese-auto' },
  'piese': { category: 'Autovehicule', subcategory: 'piese-auto' },
  // Utilaje
  'utilaje': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-constructii' },
  'utilaje constructii': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-constructii' },
  'utilaje agricole': { category: 'Utilaje & Echipamente', subcategory: 'utilaje-agricole' },
  'tractor agricol': { category: 'Utilaje & Echipamente', subcategory: 'tractoare-combine' },
  'echipamente forestiere': { category: 'Utilaje & Echipamente', subcategory: 'echipamente-forestiere' },
  'generatoare': { category: 'Utilaje & Echipamente', subcategory: 'generatoare' },
  'scule profesionale': { category: 'Utilaje & Echipamente', subcategory: 'scule-profesionale' },
  'echipamente ateliere': { category: 'Utilaje & Echipamente', subcategory: 'echipamente-ateliere' },
  'echipamente electrice': { category: 'Utilaje & Echipamente', subcategory: 'echipamente-electrice' },
  // Artă
  'arta': { category: 'Artă & Antichități', subcategory: 'picturi' },
  'antichitati': { category: 'Artă & Antichități', subcategory: 'obiecte-colectie' },
  'picturi': { category: 'Artă & Antichități', subcategory: 'picturi' },
  'sculpturi': { category: 'Artă & Antichități', subcategory: 'sculpturi' },
  'bijuterii': { category: 'Artă & Antichități', subcategory: 'bijuterii' },
  'obiecte colectie': { category: 'Artă & Antichități', subcategory: 'obiecte-colectie' },
  'mobilier epoca': { category: 'Artă & Antichități', subcategory: 'mobilier-epoca' },
  'carti rare': { category: 'Artă & Antichități', subcategory: 'carti-rare' },
  'fotografie artistica': { category: 'Artă & Antichități', subcategory: 'fotografie-artistica' },
  'licitatii caritabile': { category: 'Artă & Antichități', subcategory: 'licitatii-caritabile' },
  // Electronice
  'electronice': { category: 'Electronice & Tehnologie', subcategory: 'laptopuri-pc' },
  'laptopuri': { category: 'Electronice & Tehnologie', subcategory: 'laptopuri-pc' },
  'pc': { category: 'Electronice & Tehnologie', subcategory: 'laptopuri-pc' },
  'telefoane': { category: 'Electronice & Tehnologie', subcategory: 'telefoane' },
  'tablete': { category: 'Electronice & Tehnologie', subcategory: 'tablete' },
  'tv': { category: 'Electronice & Tehnologie', subcategory: 'tv-audio' },
  'audio': { category: 'Electronice & Tehnologie', subcategory: 'tv-audio' },
  'console': { category: 'Electronice & Tehnologie', subcategory: 'console-jocuri' },
  'jocuri': { category: 'Electronice & Tehnologie', subcategory: 'console-jocuri' },
  'drone': { category: 'Electronice & Tehnologie', subcategory: 'drone-gadgeturi' },
  'echipamente foto': { category: 'Electronice & Tehnologie', subcategory: 'echipamente-foto' },
  // Casă
  'mobilier': { category: 'Mobilier & Casă', subcategory: 'mobilier-interior' },
  'mobilier interior': { category: 'Mobilier & Casă', subcategory: 'mobilier-interior' },
  'mobilier exterior': { category: 'Mobilier & Casă', subcategory: 'mobilier-exterior' },
  'gradinarit': { category: 'Mobilier & Casă', subcategory: 'echipamente-gradinarit' },
  'decoratiuni': { category: 'Mobilier & Casă', subcategory: 'decoratiuni' },
  'electrocasnice': { category: 'Mobilier & Casă', subcategory: 'electrocasnice' },
  // Modă
  'moda': { category: 'Modă & Lifestyle', subcategory: 'haine-designer' },
  'haine': { category: 'Modă & Lifestyle', subcategory: 'haine-designer' },
  'incaltaminte': { category: 'Modă & Lifestyle', subcategory: 'incaltaminte' },
  'genti': { category: 'Modă & Lifestyle', subcategory: 'genti-accesorii' },
  'parfumuri': { category: 'Modă & Lifestyle', subcategory: 'parfumuri-cosmetice' },
  'ceasuri': { category: 'Modă & Lifestyle', subcategory: 'ceasuri-lux' },
  // Mama și copilul
  'mama si copilul': { category: 'Mama și copilul', subcategory: 'jucarii' },
  'copil': { category: 'Mama și copilul', subcategory: 'jucarii' },
  'jucarii': { category: 'Mama și copilul', subcategory: 'jucarii' },
  'carucioare': { category: 'Mama și copilul', subcategory: 'carucioare' },
  // Agricultură
  'agricultura': { category: 'Agricultură & Zootehnie', subcategory: 'tractoare-combine' },
  'tractoare': { category: 'Agricultură & Zootehnie', subcategory: 'tractoare-combine' },
  'combine': { category: 'Agricultură & Zootehnie', subcategory: 'tractoare-combine' },
  'remorci agricole': { category: 'Agricultură & Zootehnie', subcategory: 'remorci-agricole' },
  'irigatii': { category: 'Agricultură & Zootehnie', subcategory: 'echipamente-irigatii' },
  'animale': { category: 'Agricultură & Zootehnie', subcategory: 'animale' },
  'seminte': { category: 'Agricultură & Zootehnie', subcategory: 'seminte-furaje' },
  'furaje': { category: 'Agricultură & Zootehnie', subcategory: 'seminte-furaje' },
  // Maritime
  'maritime': { category: 'Maritime & Aeronautice', subcategory: 'barci-iahturi' },
  'barci': { category: 'Maritime & Aeronautice', subcategory: 'barci-iahturi' },
  'iahturi': { category: 'Maritime & Aeronautice', subcategory: 'barci-iahturi' },
  'motoare marine': { category: 'Maritime & Aeronautice', subcategory: 'motoare-marine' },
  'avioane': { category: 'Maritime & Aeronautice', subcategory: 'avioane' },
  'drone industriale': { category: 'Maritime & Aeronautice', subcategory: 'drone-industriale' },
  // Business
  'business': { category: 'Business & Licitații', subcategory: 'echipamente-birou' },
  'echipamente birou': { category: 'Business & Licitații', subcategory: 'echipamente-birou' },
  'mobilier comercial': { category: 'Business & Licitații', subcategory: 'mobilier-comercial' },
  'lichidari': { category: 'Business & Licitații', subcategory: 'lichidari-firme' },
  'loturi stocuri': { category: 'Business & Licitații', subcategory: 'loturi-stocuri' },
  // Materiale
  'materiale': { category: 'Materiale Construcții', subcategory: 'ciment-caramida' },
  'ciment': { category: 'Materiale Construcții', subcategory: 'ciment-caramida' },
  'caramida': { category: 'Materiale Construcții', subcategory: 'ciment-caramida' },
  'otel': { category: 'Materiale Construcții', subcategory: 'ciment-caramida' },
  'izolatie': { category: 'Materiale Construcții', subcategory: 'materiale-izolatie' },
  'feronerie': { category: 'Materiale Construcții', subcategory: 'feronerie-unelte' },
  'unelte': { category: 'Materiale Construcții', subcategory: 'feronerie-unelte' },
  'usi': { category: 'Materiale Construcții', subcategory: 'usi-ferestre' },
  'ferestre': { category: 'Materiale Construcții', subcategory: 'usi-ferestre' },
  // Diverse / Executări
  'diverse': { category: 'Diverse / Speciale', subcategory: 'bunuri-confiscate' },
  'alte': { category: 'Diverse / Speciale', subcategory: 'bunuri-confiscate' },
  'altele': { category: 'Diverse / Speciale', subcategory: 'bunuri-confiscate' },
  'executari': { category: 'Executări', subcategory: 'exec-altele' },
  'executari imobiliare': { category: 'Executări', subcategory: 'exec-imobiliare' },
  'executari autovehicule': { category: 'Executări', subcategory: 'exec-autovehicule' },
  'fara categorie': { category: 'Diverse / Speciale', subcategory: 'bunuri-confiscate' },
};

const FALLBACK: ResolvedCategory = {
  category: 'Diverse / Speciale',
  subcategory: 'bunuri-confiscate',
};

/**
 * Resolve category from source string (licitatii_insolventa_listings.category).
 * Returns null if not found, so caller can use detect-category (AI).
 */
export function resolveCategoryFromSource(sourceCategory: string | null | undefined): ResolvedCategory | null {
  const n = norm(sourceCategory || '');
  if (!n) return null;
  const resolved = SOURCE_TO_RESOLVED[n];
  if (resolved) return resolved;
  // Încercăm match parțial (primul cuvânt sau variante)
  const firstWord = n.split(/\s+/)[0] || '';
  return SOURCE_TO_RESOLVED[firstWord] ?? null;
}

/**
 * Returnează întotdeauna o categorie: fie din mapare, fie fallback.
 */
export function resolveCategoryFromSourceWithFallback(sourceCategory: string | null | undefined): ResolvedCategory {
  return resolveCategoryFromSource(sourceCategory) ?? FALLBACK;
}

/** Subcategorie „Tractoare” (slug tractoare-combine) – Utilaje & Echipamente. */
const RESOLVED_TRACTOR_AGRICOL: ResolvedCategory = {
  category: 'Utilaje & Echipamente',
  subcategory: 'tractoare-combine',
};

/**
 * Rezolvă categoria și subcategoria folosind și titlul/descrierea.
 * Când titlul sau descrierea conține „tractor agricol” → Utilaje & Echipamente, subcategorie Tractoare (tractoare-combine).
 */
export function resolveCategoryFromSourceWithTitleDescription(
  sourceCategory: string | null | undefined,
  title?: string | null,
  descriptionText?: string | null
): ResolvedCategory {
  const combined = [title, descriptionText].filter(Boolean).join(' ');
  const t = norm(combined);
  if (t && /\btractor\s*agricol\b/.test(t)) return RESOLVED_TRACTOR_AGRICOL;
  return resolveCategoryFromSourceWithFallback(sourceCategory);
}

/**
 * Inferă categoria principală din text (titlu + descriere), doar când există un semnal clar.
 * Ordine: reguli mai specifice înainte (ex. "masini de cusut" înainte de "masini").
 * Returnează null dacă nu găsește un match clar – atunci rămânem la Diverse.
 */
export function inferMainCategoryFromText(text: string | null | undefined): MainCategoryInsolventa | null {
  const t = norm(text || '');
  if (!t) return null;
  // Imobiliare – teren, clădiri, construcție, imobil, proprietate, birouri, depozit (text e normalizat fără diacritice)
  if (/\b(teren|terenuri|cladire|cladiri|constructie|constructii|imobil|apartament|apartamente|case|vile|spatii\s*comerciale|hale|teren\s*cu\s*cladire|teren\s*si\s*cladiri|proprietate\s*industriala|proprietate\s*imobilara|propietate\s*industriala|cladire\s*de\s*birouri|depozit|birouri)\b/.test(t))
    return 'Imobiliare';
  // Autovehicule – remorcă, semiremorcă, camion, tir (nu "mașini de cusut")
  if (/\b(semiremorca|remorca|remorci|camion|camioane|tir|autovehicul|autoturism|autoturisme|masina\b|motocicleta|scuter|autorulota|rulota)\b/.test(t))
    return 'Autovehicule';
  // Utilaje & Echipamente – mașini de cusut, utilaje, tractor agricol, tractoare
  if (/\b(tractor\s*agricol|tractoare\b|masini\s*de\s*cusut|utilaje\s*patiserie|utilaj\b|utilaje\b|echipament|echipamente|masini\s*si\s*utilaje)\b/.test(t))
    return 'Utilaje & Echipamente';
  // Electronice
  if (/\b(laptop|pc\b|telefon|tableta|tv\b|electronice|consola|drone)\b/.test(t))
    return 'Electronice & Tehnologie';
  return null;
}

/**
 * Categoria principală (una din cele 7) pentru un listing.
 * Folosit la completare main_category în DB și la filtre admin.
 * 1) Dacă titlul/descrierea indică mai multe bunuri în același anunț → Oferte grupate.
 * 2) Din category sursă (inclusiv teren → Imobiliare, utilaje → Utilaje & Echipamente).
 * 3) Dacă rezultatul e Diverse și avem titlu/descriere, se încearcă inferența din text.
 */
export function getMainCategoryFromSource(
  sourceCategory: string | null | undefined,
  title?: string | null,
  descriptionText?: string | null
): MainCategoryInsolventa {
  if (hasMultipleGoodsInAnnouncement(title, descriptionText)) return 'Oferte grupate';
  const n = norm(sourceCategory || '');
  if (n && /\bteren\b/.test(n)) return 'Imobiliare';
  if (n && /\butilaje\b/.test(n)) return 'Utilaje & Echipamente';
  const resolved = resolveCategoryFromSourceWithFallback(sourceCategory);
  let main = toMainCategory(resolved.category);
  if (main === 'Diverse / Speciale' && (title || descriptionText)) {
    const combined = [title, descriptionText].filter(Boolean).join(' ');
    const inferred = inferMainCategoryFromText(combined);
    if (inferred) main = inferred;
  }
  return main;
}

/** Răspuns de la POST /api/detect-category */
export interface DetectCategoryResponse {
  category: string;
  subcategory: string;
}

/**
 * Convertește răspunsul de la detect-category (nume categorie + nume subcategorie)
 * la ResolvedCategory (category display name + subcategory slug).
 */
export function resolvedFromDetectCategoryResponse(response: DetectCategoryResponse | null): ResolvedCategory {
  if (!response?.category) return FALLBACK;
  const subSlug = SUBCATEGORY_DISPLAY_TO_KEY[response.subcategory]
    ?? SUBCATEGORY_DISPLAY_TO_KEY[response.subcategory.trim()]
    ?? response.subcategory.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
  return {
    category: response.category,
    subcategory: subSlug,
  };
}
