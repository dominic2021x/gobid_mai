/**
 * Logging centralizat pentru pipeline-ul ANAF
 * Loghează toate etapele de extragere preț pentru debugging
 */

export interface PriceExtractionLog {
  step: string;
  timestamp?: string; // Opțional - se adaugă automat în logPriceExtraction
  ocrText?: string;
  fuzzyPriceBefore?: string;
  fuzzyPriceAfter?: number | null;
  ocrPrice?: number | null;
  gptPriceBun?: number | null;
  gptPriceLicitatie?: number | null;
  finalPrice?: number | null;
  metadata?: Record<string, any>;
}

const logs: PriceExtractionLog[] = [];

/**
 * Loghează o etapă din pipeline-ul de extragere preț
 */
export function logPriceExtraction(log: PriceExtractionLog): void {
  const logEntry: PriceExtractionLog = {
    ...log,
    timestamp: new Date().toISOString(),
  };

  logs.push(logEntry);

  // Log la consolă pentru debugging
  console.log(`[ANAF Price Log] ${log.step}:`, {
    fuzzyPriceBefore: log.fuzzyPriceBefore,
    fuzzyPriceAfter: log.fuzzyPriceAfter,
    ocrPrice: log.ocrPrice,
    gptPriceBun: log.gptPriceBun,
    gptPriceLicitatie: log.gptPriceLicitatie,
    finalPrice: log.finalPrice,
    ...log.metadata,
  });
}

/**
 * Obține toate logurile pentru un import
 */
export function getPriceExtractionLogs(): PriceExtractionLog[] {
  return [...logs];
}

/**
 * Șterge toate logurile (pentru cleanup)
 */
export function clearPriceExtractionLogs(): void {
  logs.length = 0;
}

/**
 * Loghează textul OCR brut
 */
export function logOCRText(ocrText: string): void {
  logPriceExtraction({
    step: 'OCR_TEXT',
    ocrText: ocrText.substring(0, 500), // Primele 500 caractere pentru a nu umple logurile
  });
}

/**
 * Loghează prețul fuzzy înainte de normalizare
 */
export function logFuzzyPriceBefore(rawPrice: string): void {
  logPriceExtraction({
    step: 'FUZZY_PRICE_BEFORE',
    fuzzyPriceBefore: rawPrice,
  });
}

/**
 * Loghează prețul fuzzy după normalizare
 */
export function logFuzzyPriceAfter(normalizedPrice: number | null): void {
  logPriceExtraction({
    step: 'FUZZY_PRICE_AFTER',
    fuzzyPriceAfter: normalizedPrice,
  });
}

/**
 * Loghează prețul detectat din OCR
 */
export function logOCRPrice(ocrPrice: number | null): void {
  logPriceExtraction({
    step: 'OCR_PRICE',
    ocrPrice,
  });
}

/**
 * Loghează prețul detectat de GPT la nivel de bun
 */
export function logGPTPriceBun(gptPrice: number | null): void {
  logPriceExtraction({
    step: 'GPT_PRICE_BUN',
    gptPriceBun: gptPrice,
  });
}

/**
 * Loghează prețul detectat de GPT la nivel de licitație
 */
export function logGPTPriceLicitatie(gptPrice: number | null): void {
  logPriceExtraction({
    step: 'GPT_PRICE_LICITATIE',
    gptPriceLicitatie: gptPrice,
  });
}

/**
 * Loghează prețul final ales
 */
export function logFinalPrice(finalPrice: number | null): void {
  logPriceExtraction({
    step: 'FINAL_PRICE',
    finalPrice,
  });
}


