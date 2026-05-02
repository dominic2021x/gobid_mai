/**
 * Fuzzy Matching / Spell Correction pentru căutare
 * Corectează greșelile comune și normalizează query-ul
 */

/**
 * Dicționar de corecții comune pentru limba română
 */
const COMMON_CORRECTIONS: Record<string, string> = {
  // Telefoane
  'telefon': 'telefon',
  'telefoane': 'telefoane',
  'telefoan': 'telefon',
  'telefone': 'telefoane',
  'telefonu': 'telefon',
  'telefonul': 'telefon',
  
  // Laptop
  'laptop': 'laptop',
  'laptopuri': 'laptopuri',
  'laptopp': 'laptop',
  'lapto': 'laptop',
  
  // Cumpăr
  'cumpăr': 'cumpăr',
  'cumpar': 'cumpăr',
  'cumpără': 'cumpăr',
  'cumpara': 'cumpăr',
  
  // Arată
  'arată': 'arată',
  'arata': 'arată',
  'arătă': 'arată',
  'show': 'arată',
  'show me': 'arată',
  
  // Categorie
  'electronice': 'electronice',
  'electronicee': 'electronice',
  'bijuterii': 'bijuterii',
  'bijuteri': 'bijuterii',
};

/**
 * Calculează distanța Levenshtein între două stringuri (optimizată)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Early return pentru stringuri identice
  if (str1 === str2) return 0;
  
  // Dacă diferența de lungime e prea mare, e improbabil să fie similar
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return Math.max(m, n);
  
  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    dp[i][0] = i;
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + 1   // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculează similaritatea între două stringuri (0-1, 1 = identic)
 */
function similarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

/**
 * Normalizează textul pentru căutare (elimină diacritice, lowercase)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .trim();
}

/**
 * Dicționar extins cu corecții pentru română
 */
const EXTENDED_CORRECTIONS: Record<string, string> = {
  ...COMMON_CORRECTIONS,
  // Apartament și variante
  'apartament': 'apartament',
  'aprtment': 'apartament',
  'apartmnt': 'apartament',
  'aprtmnt': 'apartament',
  'apartamen': 'apartament',
  'apartmant': 'apartament',
  'partmnt': 'apartament',
  'apart': 'apartament',
  
  // iPhone / iPad - greșeli frecvente (ip, ipoh, ipod)
  'ipoh': 'iphone',
  'ipone': 'iphone',
  'iphon': 'iphone',
  'iphne': 'iphone',
  'ipod': 'ipod',
  'ipad': 'ipad',
  'ip': 'iphone', // 99% users mean iphone when typing "ip"
  // Piese auto (inclusiv greșeli: barra → bara, bară → bara)
  'airpa': 'aripa',
  'arpa': 'aripa',
  'barra': 'bara',
  'bară': 'bara',
  'bara': 'bara',
  'capot': 'capota',
  'capota': 'capota',
  // Telefon și variante
  'tel': 'telefon',
  'telef': 'telefon',
  'tele': 'telefon',
  
  // Laptop și variante
  'lapt': 'laptop',
  'lap': 'laptop',
  
  // Cumpăr și variante
  'cump': 'cumpăr',
  'cumpa': 'cumpăr',
  
  // Arată și variante
  'arat': 'arată',
  'ara': 'arată',
  
  // Electronice
  'electron': 'electronice',
  'electr': 'electronice',
  
  // Bijuterii
  'bijuter': 'bijuterii',
  'bijut': 'bijuterii',
  
  // Mama și copilul
  'mama copil': 'mama-copil',
  'mama si copilul': 'mama-copil',
  'mama-copilul': 'mama-copil',
  
  // Cuvinte comune platformă
  'licitatii': 'licitații',
  'licitat': 'licitații',
  'licit': 'licitații',
  'licita': 'licitații',
  
  // Tokeni
  'tokeni': 'tokeni',
  'token': 'tokeni',
  'tokn': 'tokeni',
  'tkn': 'tokeni',
  
  // Suport
  'suport': 'suport',
  'suportt': 'suport',
  'suprt': 'suport',
  
  // Produse
  'produse': 'produse',
  'produs': 'produse',
  'prod': 'produse',
  'produ': 'produse',
  
  // Cont
  'cont': 'cont',
  'count': 'cont',
  'accont': 'cont',
  
  // Dashboard
  'dashboard': 'dashboard',
  'dashbord': 'dashboard',
  'dash': 'dashboard',
  'dashb': 'dashboard',
};

/**
 * Corectează greșelile comune dintr-un query (cu spell correction avansat)
 */
export function correctSpelling(query: string): string {
  const words = query.split(/\s+/);
  const correctedWords = words.map(word => {
    const normalized = normalizeText(word);
    
    // Verifică în dicționar direct
    if (EXTENDED_CORRECTIONS[normalized]) {
      return EXTENDED_CORRECTIONS[normalized];
    }
    
    // Caută cea mai apropiată corecție cu similaritate (threshold 65% pentru mai multă flexibilitate)
    let bestMatch = word;
    let bestSimilarity = 0;
    const threshold = 0.65; // 65% similaritate (mai permisiv)
    
    // Verifică direct în dicționar extins
    for (const [correct, correction] of Object.entries(EXTENDED_CORRECTIONS)) {
      const sim = similarity(normalized, correct);
      if (sim > bestSimilarity && sim >= threshold) {
        bestSimilarity = sim;
        bestMatch = correction;
      }
    }
    
    // Dacă nu s-a găsit ceva bun, încearcă fuzzy match mai agresiv
    if (bestSimilarity < 0.8 && normalized.length >= 3) {
      for (const [correct, correction] of Object.entries(EXTENDED_CORRECTIONS)) {
        const distance = levenshteinDistance(normalized, correct);
        const maxLen = Math.max(normalized.length, correct.length);
        const sim = maxLen > 0 ? 1 - (distance / maxLen) : 0;
        
        // Permite corecții chiar dacă lipsesc 1-3 litere sau sunt greșite
        // Pentru cuvinte mai lungi (ex: "apartament"), permite până la 30% eroare
        const maxAllowedDistance = Math.max(2, Math.floor(correct.length * 0.3));
        
        if (sim > bestSimilarity && sim >= 0.65 && distance <= maxAllowedDistance) {
          bestSimilarity = sim;
          bestMatch = correction;
        }
      }
    }
    
    // Verifică și cuvinte parțiale (ex: "apart" → "apartament")
    if (bestSimilarity < 0.8 && normalized.length >= 4) {
      for (const [correct, correction] of Object.entries(EXTENDED_CORRECTIONS)) {
        // Verifică dacă query-ul e substring al cuvântului corect
        if (correction.toLowerCase().startsWith(normalized) && correction.length > normalized.length) {
          const partialSim = normalized.length / correction.length;
          if (partialSim > bestSimilarity && partialSim >= 0.6) {
            bestSimilarity = partialSim;
            bestMatch = correction;
          }
        }
      }
    }
    
    return bestMatch;
  });
  
  return correctedWords.join(' ');
}

/**
 * Expandă query-ul cu sinonime și variante
 */
export function expandQuery(query: string): string[] {
  const variants = [query];
  const normalized = normalizeText(query);
  
  // Sinonime simple
  const synonyms: Record<string, string[]> = {
    'telefon': ['telefoane', 'smartphone', 'mobil'],
    'laptop': ['laptopuri', 'notebook', 'computer'],
    'cumpăr': ['cumpără', 'caut', 'văd', 'găsesc'],
    'arată': ['afișează', 'show', 'găsește'],
    'sub': ['mai puțin decât', 'până la', 'maximum'],
    'peste': ['mai mult decât', 'minimum', 'de la'],
  };
  
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (synonyms[word]) {
      for (const synonym of synonyms[word]) {
        const variant = query.replace(new RegExp(word, 'gi'), synonym);
        if (!variants.includes(variant)) {
          variants.push(variant);
        }
      }
    }
  }
  
  return variants.slice(0, 3); // Max 3 variante
}

/**
 * Optimizează query-ul pentru căutare semantică
 */
export function optimizeQuery(query: string): {
  original: string;
  corrected: string;
  variants: string[];
} {
  const corrected = correctSpelling(query);
  const variants = expandQuery(corrected);
  
  return {
    original: query,
    corrected,
    variants,
  };
}


