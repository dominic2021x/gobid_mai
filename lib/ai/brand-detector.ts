/**
 * Detectează branduri, categorii și modele din query
 * Pentru sugestii inteligente și filtrare automată
 */

export interface BrandInfo {
  brand: string;
  fullBrand: string;
  category?: string;
}

export interface QueryAnalysis {
  hasBrand: boolean;
  hasCategory: boolean;
  hasModel: boolean;
  brand?: BrandInfo;
  category?: string;
  model?: string;
  suggestion?: 'brand-only' | 'brand-model' | 'category-only' | 'general';
}

/**
 * Dicționar branduri pentru TOATE categoriile
 * Fiecare brand are categoria sa asociată
 */
const ALL_BRANDS: Record<string, BrandInfo> = {
  // AUTO
  'bmw': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'bemveu': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'bemve': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'bemv': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'beemve': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'beemveu': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'bmv': { brand: 'bmw', fullBrand: 'BMW', category: 'Auto' },
  'mercedes': { brand: 'mercedes', fullBrand: 'Mercedes-Benz', category: 'Auto' },
  'mercedes benz': { brand: 'mercedes', fullBrand: 'Mercedes-Benz', category: 'Auto' },
  'audi': { brand: 'audi', fullBrand: 'Audi', category: 'Auto' },
  'opel': { brand: 'opel', fullBrand: 'Opel', category: 'Auto' },
  'volkswagen': { brand: 'volkswagen', fullBrand: 'Volkswagen', category: 'Auto' },
  'vw': { brand: 'volkswagen', fullBrand: 'Volkswagen', category: 'Auto' },
  'ford': { brand: 'ford', fullBrand: 'Ford', category: 'Auto' },
  'renault': { brand: 'renault', fullBrand: 'Renault', category: 'Auto' },
  'peugeot': { brand: 'peugeot', fullBrand: 'Peugeot', category: 'Auto' },
  'dacia': { brand: 'dacia', fullBrand: 'Dacia', category: 'Auto' },
  'skoda': { brand: 'skoda', fullBrand: 'Škoda', category: 'Auto' },
  'seat': { brand: 'seat', fullBrand: 'SEAT', category: 'Auto' },
  'fiat': { brand: 'fiat', fullBrand: 'Fiat', category: 'Auto' },
  'toyota': { brand: 'toyota', fullBrand: 'Toyota', category: 'Auto' },
  'honda': { brand: 'honda', fullBrand: 'Honda', category: 'Auto' },
  'mazda': { brand: 'mazda', fullBrand: 'Mazda', category: 'Auto' },
  'nissan': { brand: 'nissan', fullBrand: 'Nissan', category: 'Auto' },
  'volvo': { brand: 'volvo', fullBrand: 'Volvo', category: 'Auto' },
  'hyundai': { brand: 'hyundai', fullBrand: 'Hyundai', category: 'Auto' },
  'kia': { brand: 'kia', fullBrand: 'Kia', category: 'Auto' },
  
  // BLUGI & ÎMBRĂCĂMINTE
  'levis': { brand: 'levis', fullBrand: 'Levi\'s', category: 'Îmbrăcăminte' },
  'levi': { brand: 'levis', fullBrand: 'Levi\'s', category: 'Îmbrăcăminte' },
  'diesel': { brand: 'diesel', fullBrand: 'Diesel', category: 'Îmbrăcăminte' },
  'wrangler': { brand: 'wrangler', fullBrand: 'Wrangler', category: 'Îmbrăcăminte' },
  'lee': { brand: 'lee', fullBrand: 'Lee', category: 'Îmbrăcăminte' },
  'calvin klein': { brand: 'calvin klein', fullBrand: 'Calvin Klein', category: 'Îmbrăcăminte' },
  'ck': { brand: 'calvin klein', fullBrand: 'Calvin Klein', category: 'Îmbrăcăminte' },
  'tommy hilfiger': { brand: 'tommy hilfiger', fullBrand: 'Tommy Hilfiger', category: 'Îmbrăcăminte' },
  'hugo boss': { brand: 'hugo boss', fullBrand: 'Hugo Boss', category: 'Îmbrăcăminte' },
  'nike': { brand: 'nike', fullBrand: 'Nike', category: 'Îmbrăcăminte' },
  'adidas': { brand: 'adidas', fullBrand: 'Adidas', category: 'Îmbrăcăminte' },
  'puma': { brand: 'puma', fullBrand: 'Puma', category: 'Îmbrăcăminte' },
  'reebok': { brand: 'reebok', fullBrand: 'Reebok', category: 'Îmbrăcăminte' },
  'zara': { brand: 'zara', fullBrand: 'Zara', category: 'Îmbrăcăminte' },
  'h&m': { brand: 'h&m', fullBrand: 'H&M', category: 'Îmbrăcăminte' },
  'hm': { brand: 'h&m', fullBrand: 'H&M', category: 'Îmbrăcăminte' },
  
  // ALIAS-uri pentru Nike, Adidas, Puma ca Încălțăminte
  'nike incaltaminte': { brand: 'nike', fullBrand: 'Nike', category: 'Încălțăminte' },
  'adidas incaltaminte': { brand: 'adidas', fullBrand: 'Adidas', category: 'Încălțăminte' },
  'puma incaltaminte': { brand: 'puma', fullBrand: 'Puma', category: 'Încălțăminte' },
  
  // ELECTRONICE & TEHNOLOGIE
  'samsung': { brand: 'samsung', fullBrand: 'Samsung', category: 'Electronice' },
  'apple': { brand: 'apple', fullBrand: 'Apple', category: 'Electronice' },
  'iphone': { brand: 'apple', fullBrand: 'Apple', category: 'Electronice' },
  'lg': { brand: 'lg', fullBrand: 'LG', category: 'Electronice' },
  'sony': { brand: 'sony', fullBrand: 'Sony', category: 'Electronice' },
  'huawei': { brand: 'huawei', fullBrand: 'Huawei', category: 'Electronice' },
  'xiaomi': { brand: 'xiaomi', fullBrand: 'Xiaomi', category: 'Electronice' },
  'dell': { brand: 'dell', fullBrand: 'Dell', category: 'Electronice' },
  'hp': { brand: 'hp', fullBrand: 'HP', category: 'Electronice' },
  'lenovo': { brand: 'lenovo', fullBrand: 'Lenovo', category: 'Electronice' },
  'asus': { brand: 'asus', fullBrand: 'ASUS', category: 'Electronice' },
  'acer': { brand: 'acer', fullBrand: 'Acer', category: 'Electronice' },
  'microsoft': { brand: 'microsoft', fullBrand: 'Microsoft', category: 'Electronice' },
  'msi': { brand: 'msi', fullBrand: 'MSI', category: 'Electronice' },
  'oneplus': { brand: 'oneplus', fullBrand: 'OnePlus', category: 'Electronice' },
  'oppo': { brand: 'oppo', fullBrand: 'Oppo', category: 'Electronice' },
  'vivo': { brand: 'vivo', fullBrand: 'Vivo', category: 'Electronice' },
  
  // BIJUTERII & ACCESORII
  'tiffany': { brand: 'tiffany', fullBrand: 'Tiffany & Co.', category: 'Bijuterii' },
  'cartier': { brand: 'cartier', fullBrand: 'Cartier', category: 'Bijuterii' },
  'rolex': { brand: 'rolex', fullBrand: 'Rolex', category: 'Bijuterii' },
  'omega': { brand: 'omega', fullBrand: 'Omega', category: 'Bijuterii' },
  'swatch': { brand: 'swatch', fullBrand: 'Swatch', category: 'Bijuterii' },
  'casio': { brand: 'casio', fullBrand: 'Casio', category: 'Bijuterii' },
  'guess': { brand: 'guess', fullBrand: 'Guess', category: 'Bijuterii' },
  'fossil': { brand: 'fossil', fullBrand: 'Fossil', category: 'Bijuterii' },
  
  // MOBILIER & CASA
  'ikea': { brand: 'ikea', fullBrand: 'IKEA', category: 'Mobilier' },
  'jysk': { brand: 'jysk', fullBrand: 'JYSK', category: 'Mobilier' },
  'home ideea': { brand: 'home ideea', fullBrand: 'Home Ideea', category: 'Mobilier' },
  'bo concept': { brand: 'bo concept', fullBrand: 'BoConcept', category: 'Mobilier' },
  
  // INCALTAMINTE (fără duplicate - Nike, Adidas, Puma sunt deja la Îmbrăcăminte)
  'converse': { brand: 'converse', fullBrand: 'Converse', category: 'Încălțăminte' },
  'vans': { brand: 'vans', fullBrand: 'Vans', category: 'Încălțăminte' },
  'new balance': { brand: 'new balance', fullBrand: 'New Balance', category: 'Încălțăminte' },
  'nb': { brand: 'new balance', fullBrand: 'New Balance', category: 'Încălțăminte' },
};

/**
 * Dicționar modele comune (doar pentru Auto)
 */
const COMMON_MODELS: Record<string, string[]> = {
  'bmw': ['seria 3', 'seria 5', 'seria 7', 'x1', 'x3', 'x5', 'x7', 'serie 3', 'serie 5'],
  'mercedes': ['clasa a', 'clasa c', 'clasa e', 'clasa s', 'gla', 'glc', 'gle', 'gls'],
  'audi': ['a3', 'a4', 'a5', 'a6', 'a8', 'q3', 'q5', 'q7', 'q8'],
  'opel': ['astra', 'corsa', 'insignia', 'mokka', 'crossland', 'grandland'],
  'volkswagen': ['golf', 'polo', 'passat', 'tiguan', 'touareg'],
  'ford': ['focus', 'fiesta', 'mondeo', 'kuga', 'puma'],
};

/**
 * Categorii principale
 */
const MAIN_CATEGORIES: Record<string, string> = {
  // Auto
  'masina': 'Auto',
  'masini': 'Auto',
  'auto': 'Auto',
  'automobil': 'Auto',
  'automobile': 'Auto',
  
  // Electronice
  'telefon': 'Electronice',
  'telefoane': 'Electronice',
  'laptop': 'Electronice',
  'laptopuri': 'Electronice',
  'electronice': 'Electronice',
  'smartphone': 'Electronice',
  'tablet': 'Electronice',
  'tableta': 'Electronice',
  
  // Îmbrăcăminte
  'blugi': 'Îmbrăcăminte',
  'jeans': 'Îmbrăcăminte',
  'haine': 'Îmbrăcăminte',
  'imbracaminte': 'Îmbrăcăminte',
  'tricou': 'Îmbrăcăminte',
  'tricouri': 'Îmbrăcăminte',
  'camasa': 'Îmbrăcăminte',
  'cămăși': 'Îmbrăcăminte',
  
  // Bijuterii
  'bijuterie': 'Bijuterii',
  'bijuterii': 'Bijuterii',
  'ceas': 'Bijuterii',
  'ceasuri': 'Bijuterii',
  'colier': 'Bijuterii',
  'cercei': 'Bijuterii',
  'brățări': 'Bijuterii',
  
  // Mobilier
  'mobilier': 'Mobilier',
  'canapea': 'Mobilier',
  'masa': 'Mobilier',
  'scaun': 'Mobilier',
  'pat': 'Mobilier',
  
  // Încălțăminte
  'incaltaminte': 'Încălțăminte',
  'pantofi': 'Încălțăminte',
  'adidasi': 'Încălțăminte',
  'cizme': 'Încălțăminte',
};

/**
 * Analizează query-ul pentru branduri, categorii și modele
 */
export function analyzeQuery(query: string): QueryAnalysis {
  const lowerQuery = normalizeQuery(query);
  const words = lowerQuery.split(/\s+/);
  
  let brand: BrandInfo | undefined;
  let category: string | undefined;
  let model: string | undefined;
  
  // Detectează brand (din TOATE categoriile)
  for (const [key, brandInfo] of Object.entries(ALL_BRANDS)) {
    if (lowerQuery.includes(key) || words.some(w => w === key)) {
      brand = brandInfo;
      break;
    }
  }
  
  // Detectează categorie
  for (const [key, cat] of Object.entries(MAIN_CATEGORIES)) {
    if (lowerQuery.includes(key) || words.some(w => w === key)) {
      category = cat;
      break;
    }
  }
  
  // Detectează model (doar dacă există brand)
  if (brand) {
    const models = COMMON_MODELS[brand.brand] || [];
    for (const modelName of models) {
      if (lowerQuery.includes(modelName)) {
        model = modelName;
        break;
      }
    }
  }
  
  // Determină tipul de sugestie
  let suggestion: QueryAnalysis['suggestion'] = 'general';
  
  if (brand && model) {
    suggestion = 'brand-model'; // "BMW seria 3" → întreabă specific sau tot brand-ul
  } else if (brand && !model) {
    suggestion = 'brand-only'; // "Opel" → deschide search cu filter brand
  } else if (category && !brand) {
    suggestion = 'category-only'; // "mașini" → sugerează categoria
  }
  
  return {
    hasBrand: !!brand,
    hasCategory: !!category,
    hasModel: !!model,
    brand,
    category,
    model,
    suggestion,
  };
}

/**
 * Normalizează query pentru matching
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function removeMatchedAutoKeyFromNormalized(lower: string, key: string): string {
  if (key.includes(' ')) {
    return lower
      .replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return lower
    .split(/\s+/)
    .filter((t) => t !== key)
    .join(' ')
    .trim();
}

/**
 * Search fin (/ro): prima marcă auto din text (cheia cea mai lungă din dicționar), restul fără tokenii mărcii.
 */
export function extractAutoBrandFromFineSearchText(raw: string): {
  fullBrand: string;
  brandSlug: string;
  remainder: string;
} | null {
  const lower = normalizeQuery(raw);
  if (!lower) return null;

  const autoEntries = Object.entries(ALL_BRANDS)
    .filter(([, info]) => info.category === 'Auto')
    .sort((a, b) => b[0].length - a[0].length);

  for (const [key, info] of autoEntries) {
    let matched = false;
    if (key.includes(' ')) {
      matched = lower.includes(key);
    } else {
      const re = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      matched = re.test(lower);
    }
    if (!matched) continue;

    const remainder = removeMatchedAutoKeyFromNormalized(lower, key);
    return {
      fullBrand: info.fullBrand,
      brandSlug: info.brand,
      remainder,
    };
  }
  return null;
}

/**
 * Găsește branduri ale căror cheie sau fullBrand încep cu prefixul dat (min 2 caractere).
 * Folosit pentru autocomplete: "bm" -> BMW, "mer" -> Mercedes etc.
 */
export function getBrandsByPrefix(prefix: string): BrandInfo[] {
  const p = (prefix || '').toLowerCase().trim();
  if (p.length < 2) return [];
  const seen = new Set<string>();
  const out: BrandInfo[] = [];
  for (const [key, brandInfo] of Object.entries(ALL_BRANDS)) {
    if (seen.has(brandInfo.brand)) continue;
    const fullLower = brandInfo.fullBrand.toLowerCase();
    if (key.startsWith(p) || fullLower.startsWith(p)) {
      seen.add(brandInfo.brand);
      out.push(brandInfo);
    }
  }
  return out.slice(0, 5);
}

/** Mapare categorie brand (Auto, Electronice…) la nume afișat pe /ro */
export const BRAND_CATEGORY_TO_DISPLAY: Record<string, string> = {
  'Auto': 'Autovehicule',
  'Electronice': 'Electronice & Tehnologie',
  'Îmbrăcăminte': 'Modă & Lifestyle',
  'Bijuterii': 'Bijuterii',
  'Mobilier': 'Mobilier',
  'Încălțăminte': 'Modă & Lifestyle',
};

/**
 * Generează sugestii inteligente bazate pe analiza query-ului
 */
export function generateSmartSuggestions(query: string): string[] {
  const analysis = analyzeQuery(query);
  const suggestions: string[] = [];
  
  if (analysis.suggestion === 'brand-model') {
    // "BMW seria 3" sau alte branduri cu modele → sugerează opțiuni
    if (analysis.brand && analysis.model) {
      const brandCategory = analysis.brand.category;
      suggestions.push(
        `${analysis.brand.fullBrand} ${analysis.model}`,
        `Toate produsele ${analysis.brand.fullBrand}`,
        `${analysis.brand.fullBrand} - Alte modele`,
        `${brandCategory} - ${analysis.brand.fullBrand}`
      );
    }
  } else if (analysis.suggestion === 'brand-only') {
    // "Opel" sau "Levi's" → sugerează alte branduri din ACEEAȘI categorie
    if (analysis.brand) {
      const brandCategory = analysis.brand.category;
      suggestions.push(
        `Toate produsele ${analysis.brand.fullBrand}`,
        `${brandCategory} - ${analysis.brand.fullBrand}`
      );
      
      // Adaugă DOAR alte branduri din aceeași categorie (nu din alte categorii)
      Object.values(ALL_BRANDS)
        .filter(b => b.category === brandCategory && b.brand !== analysis.brand?.brand)
        .slice(0, 5)
        .forEach(b => {
          suggestions.push(`Produse ${b.fullBrand}`);
        });
    }
  } else if (analysis.suggestion === 'category-only') {
    // "mașini" sau "blugi" → sugerează branduri din acea categorie
    if (analysis.category) {
      suggestions.push(`Toate produsele ${analysis.category}`);
      
      // Afișează branduri din categoria respectivă
      Object.values(ALL_BRANDS)
        .filter(b => b.category === analysis.category)
        .slice(0, 8)
        .forEach(b => {
          suggestions.push(`Produse ${b.fullBrand}`);
        });
    }
  }
  
  return suggestions.slice(0, 8);
}

/**
 * Construiește URL pentru search cu filtre.
 * basePath: '/ro' = căutarea se deschide pe Licitatii, '/rezultate' = pagina rezultate dedicată.
 */
export function buildSearchUrl(query: string, filters?: {
  brand?: string;
  category?: string;
  model?: string;
}, basePath: string = '/ro'): string {
  const params = new URLSearchParams();
  params.set('q', query);
  
  if (filters?.brand) params.set('brand', filters.brand);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.model) params.set('model', filters.model);
  
  return `${basePath}?${params.toString()}`;
}

