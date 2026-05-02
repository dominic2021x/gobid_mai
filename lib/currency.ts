/**
 * Currency Conversion Utilities
 * 
 * Uses BNR (National Bank of Romania) official exchange rate.
 * Rate is fetched from /api/exchange-rate and cached in the browser.
 * 
 * Fallback rate: 4.97 (used when API is unavailable)
 */

// Default fallback rate if API is unavailable
const DEFAULT_RATE = 4.97;

// Client-side cached rate (updated by useExchangeRate hook)
let cachedRate: number = DEFAULT_RATE;
let cachedRateDate: string | null = null;

/**
 * Get the current EUR/RON rate (synchronous)
 * Uses cached value or fallback
 */
export function getRonEurRate(): number {
  // Check for env override first
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_RON_EUR_RATE) {
    const envRate = parseFloat(process.env.NEXT_PUBLIC_RON_EUR_RATE);
    if (Number.isFinite(envRate) && envRate > 0) return envRate;
  }
  return cachedRate;
}

/**
 * Update the cached rate (called by useExchangeRate hook)
 */
export function setCachedRate(rate: number, rateDate?: string): void {
  if (Number.isFinite(rate) && rate > 0) {
    cachedRate = rate;
    cachedRateDate = rateDate ?? null;
  }
}

/**
 * Get rate metadata
 */
export function getCachedRateInfo(): { rate: number; rateDate: string | null } {
  return { rate: cachedRate, rateDate: cachedRateDate };
}

/**
 * Convert Lei → EUR
 * @param ron - Amount in Lei
 * @param customRate - Optional custom rate (defaults to cached rate)
 */
export function ronToEur(ron: number, customRate?: number): number {
  if (ron <= 0 || !Number.isFinite(ron)) return 0;
  const rate = customRate ?? getRonEurRate();
  return Math.round((ron / rate) * 100) / 100;
}

/**
 * EUR afișat când prețul listării vine din conversie RON→EUR: întreg, ultima cifră 0 sau 5.
 */
export function roundEurConvertedForDisplay(eur: number): number {
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  return Math.round(eur / 5) * 5;
}

/**
 * @param listingPricedInEur - true dacă moneda listării e EUR (`products.currency`), nu RON cu EUR derivat în DB.
 */
export function eurAmountForListingDisplay(
  eurAmount: number,
  listingPricedInEur: boolean | undefined,
): number {
  if (!Number.isFinite(eurAmount) || eurAmount <= 0) return 0;
  if (listingPricedInEur) return eurAmount;
  return roundEurConvertedForDisplay(eurAmount);
}

/**
 * Convert EUR → Lei
 * @param eur - Amount in EUR
 * @param customRate - Optional custom rate (defaults to cached rate)
 */
export function eurToRon(eur: number, customRate?: number): number {
  if (eur <= 0 || !Number.isFinite(eur)) return 0;
  const rate = customRate ?? getRonEurRate();
  return Math.round(eur * rate);
}

export type DisplayCurrency = 'RON' | 'EUR';

/** Etichetă UI pentru moneda românească (codul ISO în date/API rămâne RON). */
export const DISPLAY_RON_LABEL = 'Lei';

/**
 * Etichetă scurtă pentru afișare: EUR rămâne EUR, altfel Lei.
 */
export function displayCurrencyLabel(currency: string | null | undefined): string {
  return currency === 'EUR' ? 'EUR' : DISPLAY_RON_LABEL;
}

/**
 * Get price in both Lei and EUR for a product
 * Converts automatically if one value is missing
 */
export function toPriceRonAndEur(
  priceRon: number,
  priceEur: number | null | undefined,
  customRate?: number
): { priceRon: number; priceEur: number } {
  const ron = Number.isFinite(priceRon) && priceRon >= 0 ? priceRon : 0;
  const eurRaw = Number.isFinite(priceEur) && priceEur! >= 0 ? priceEur! : 0;
  const eur = eurRaw > 0 ? eurRaw : (ron > 0 ? ronToEur(ron, customRate) : 0);
  const ronFromEur = ron > 0 ? ron : (eurRaw > 0 ? eurToRon(eurRaw, customRate) : 0);
  return {
    priceRon: ron > 0 ? ron : ronFromEur,
    priceEur: eur > 0 ? eur : ronToEur(ronFromEur, customRate),
  };
}

/**
 * Format price with currency symbol (Lei pentru RON/ISO, EUR/USD păstrate ca atare).
 */
export function formatPrice(amount: number, currency: string = 'RON'): string {
  if (!Number.isFinite(amount) || amount < 0) return 'N/A';
  const c = (currency || 'RON').toUpperCase();
  const maxFrac = c === 'EUR' || c === 'USD' ? 2 : 0;
  const formatted = new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(amount);
  if (c === 'EUR') return `${formatted} EUR`;
  if (c === 'USD') return `${formatted} USD`;
  return `${formatted} ${DISPLAY_RON_LABEL}`;
}

/**
 * Convert price to target currency
 */
export function convertPrice(
  amount: number,
  fromCurrency: DisplayCurrency,
  toCurrency: DisplayCurrency,
  customRate?: number
): number {
  if (fromCurrency === toCurrency) return amount;
  if (fromCurrency === 'RON' && toCurrency === 'EUR') return ronToEur(amount, customRate);
  if (fromCurrency === 'EUR' && toCurrency === 'RON') return eurToRon(amount, customRate);
  return amount;
}

/**
 * Get display price in the selected currency
 */
export function getDisplayPrice(
  priceRon: number,
  priceEur: number | undefined | null,
  displayCurrency: DisplayCurrency,
  customRate?: number
): number {
  if (displayCurrency === 'EUR') {
    return priceEur && priceEur > 0 ? priceEur : ronToEur(priceRon, customRate);
  }
  return priceRon && priceRon > 0 ? priceRon : eurToRon(priceEur ?? 0, customRate);
}
