/**
 * Normalizare preț fuzzy pentru OCR
 * Transformă caractere scanate incorect în cifre valide
 */

/**
 * Transformă caractere OCR incorecte în cifre
 * Z→2, O→0, l→1, D→0, S→5, etc.
 */
function fixOCRCharacters(text: string): string {
  return text
    .replace(/[Zz]/g, '2') // Z → 2
    .replace(/[Oo]/g, '0') // O → 0
    .replace(/[l|]/g, '1') // l, | → 1
    .replace(/[D]/g, '0') // D → 0
    .replace(/[Ss]/g, '5') // S → 5
    .replace(/[G]/g, '6') // G → 6
    .replace(/[B]/g, '8') // B → 8
    .replace(/[g]/g, '9') // g → 9
    .replace(/[I]/g, '1'); // I → 1
}

/**
 * Elimină toate caracterele non-numerice
 */
function removeNonNumeric(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

/**
 * Unește cifrele separate de spații
 * "2 6 2 0 0" → "26200"
 */
function joinSeparatedDigits(text: string): string {
  // Elimină spații între cifre
  return text.replace(/(\d)\s+(\d)/g, '$1$2');
}

/**
 * Validează dacă un număr este un preț valid ANAF
 * Prețurile ANAF sunt de obicei între 4 și 7 cifre
 */
function isValidPriceLength(digits: string): boolean {
  const length = digits.length;
  return length >= 4 && length <= 7;
}

/**
 * Normalizează un preț extras din OCR
 * 
 * @param rawPrice Textul brut extras din OCR (ex: "26ZOO", "26 200", "26.OO")
 * @returns Număr normalizat sau null dacă nu poate fi validat
 * 
 * @example
 * normalizePrice("26ZOO") → 26200
 * normalizePrice("26 200") → 26200
 * normalizePrice("26.OO") → 2600
 * normalizePrice("2 6 2 0 0") → 26200
 */
export function normalizePrice(rawPrice: string | null | undefined): number | null {
  if (!rawPrice) {
    return null;
  }

  // Convertim la string dacă nu este deja
  let text = String(rawPrice).trim();

  if (text.length === 0) {
    return null;
  }

  // 1. Fix caractere OCR incorecte
  text = fixOCRCharacters(text);

  // 2. Elimină caractere non-numerice (puncte, virgule, spații, etc.)
  text = removeNonNumeric(text);

  // 3. Unește cifrele separate de spații
  text = joinSeparatedDigits(text);

  // 4. Validează lungimea
  if (!isValidPriceLength(text)) {
    console.log(`[NormalizePrice] Invalid price length: "${rawPrice}" → "${text}" (${text.length} digits)`);
    return null;
  }

  // 5. Convertește la număr
  const price = parseInt(text, 10);

  if (isNaN(price) || price <= 0) {
    console.log(`[NormalizePrice] Invalid price number: "${rawPrice}" → "${text}" → ${price}`);
    return null;
  }

  console.log(`[NormalizePrice] Normalized: "${rawPrice}" → "${text}" → ${price}`);

  return price;
}

/**
 * Extrage toate numerele posibile din text și le normalizează
 * @param text Textul brut
 * @returns Array de prețuri normalizate valide
 */
export function extractAndNormalizePrices(text: string): number[] {
  const prices: number[] = [];

  // Pattern 1: Numere cu 4-7 cifre
  const numberPattern = /\b\d{4,7}\b/g;
  const matches = text.match(numberPattern);
  
  if (matches) {
    for (const match of matches) {
      const normalized = normalizePrice(match);
      if (normalized !== null) {
        prices.push(normalized);
      }
    }
  }

  // Pattern 2: Numere cu caractere OCR incorecte (ex: "26ZOO", "26.OO")
  const fuzzyPattern = /[0-9ZOlD|SsGBgI]{4,7}/g;
  const fuzzyMatches = text.match(fuzzyPattern);
  
  if (fuzzyMatches) {
    for (const match of fuzzyMatches) {
      const normalized = normalizePrice(match);
      if (normalized !== null && !prices.includes(normalized)) {
        prices.push(normalized);
      }
    }
  }

  return prices;
}



