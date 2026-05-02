/**
 * Extragere preț din text OCR
 * Caută prețuri în textul extras din OCR și le normalizează
 */

import { normalizePrice, extractAndNormalizePrices } from '../utils/normalizePrice';

/**
 * Caută prețuri în textul OCR bazat pe context
 * @param ocrText Textul extras din OCR
 * @returns Prețul detectat sau null
 */
export function extractPriceFromOCRText(ocrText: string | null | undefined): number | null {
  if (!ocrText || ocrText.trim().length === 0) {
    return null;
  }

  const text = ocrText.toLowerCase();
  const prices: number[] = [];

  // Pattern 1: După cuvinte cheie de preț
  const priceKeywords = [
    'pret',
    'preț',
    'pretul',
    'prețul',
    'evaluare',
    'licitatie',
    'licitație',
    'valoare',
    'suma',
    'pornire',
  ];

  for (const keyword of priceKeywords) {
    // Caută keyword-ul urmat de un număr
    const regex = new RegExp(`${keyword}[^0-9]{0,30}([0-9ZOlD|SsGBgI\\.\\s]{4,10})`, 'gi');
    const matches = ocrText.matchAll(regex);

    for (const match of matches) {
      if (match[1]) {
        const normalized = normalizePrice(match[1]);
        if (normalized !== null) {
          prices.push(normalized);
        }
      }
    }
  }

  // Pattern 2: Număr urmat de "lei" sau "RON"
  const currencyRegex = /([0-9ZOlD|SsGBgI\\.\\s]{4,10})\s*(lei|ron|eur|euro)/gi;
  const currencyMatches = ocrText.matchAll(currencyRegex);

  for (const match of currencyMatches) {
    if (match[1]) {
      const normalized = normalizePrice(match[1]);
      if (normalized !== null) {
        prices.push(normalized);
      }
    }
  }

  // Pattern 3: Extrage toate numerele posibile din text
  const allPrices = extractAndNormalizePrices(ocrText);
  prices.push(...allPrices);

  // Elimină duplicatele
  const uniquePrices = [...new Set(prices)];

  if (uniquePrices.length === 0) {
    console.log('[ExtractPriceOCR] No valid prices found in OCR text');
    return null;
  }

  // Heuristică ANAF: prețul cel mai mare valid este de obicei prețul de evaluare
  // (prețurile ANAF sunt de obicei între 10.000 și 1.000.000 lei)
  const validPrices = uniquePrices.filter((p) => p >= 1000 && p <= 10000000);

  if (validPrices.length === 0) {
    // Dacă nu avem prețuri în intervalul valid, folosim cel mai mare
    const maxPrice = Math.max(...uniquePrices);
    console.log(`[ExtractPriceOCR] Using max price (out of range): ${maxPrice}`);
    return maxPrice;
  }

  // Sortăm descrescător și luăm primul (cel mai mare)
  validPrices.sort((a, b) => b - a);
  const finalPrice = validPrices[0];

  console.log(`[ExtractPriceOCR] Found ${uniquePrices.length} candidate prices, selected: ${finalPrice}`);
  console.log(`[ExtractPriceOCR] All candidates: ${uniquePrices.join(', ')}`);

  return finalPrice;
}

/**
 * Extrage prețuri din multiple pagini OCR
 * @param pages Array de texte OCR (câte unul per pagină)
 * @returns Prețul detectat sau null
 */
export function extractPriceFromMultiplePages(pages: string[]): number | null {
  const allPrices: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pagePrice = extractPriceFromOCRText(pages[i]);
    if (pagePrice !== null) {
      allPrices.push(pagePrice);
      console.log(`[ExtractPriceOCR] Page ${i + 1} price: ${pagePrice}`);
    }
  }

  if (allPrices.length === 0) {
    return null;
  }

  // Heuristică: prețul cel mai mare din toate paginile
  const maxPrice = Math.max(...allPrices);
  console.log(`[ExtractPriceOCR] Max price across all pages: ${maxPrice}`);

  return maxPrice;
}



