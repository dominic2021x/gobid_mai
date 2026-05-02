/**
 * Parsare și formatare preț pentru licitații (insolventa, etc.).
 * Suportă format european (1.200,00 Euro) și american (770.00 LEI).
 */

export type LicitatiiCurrency = "RON" | "EUR";

export interface ParsedLicitatiiPrice {
  value: number;
  currency: LicitatiiCurrency;
}

/**
 * Detectează moneda din sufixul textului de preț (Euro, EUR, LEI, Lei, etc.).
 * Prețul pe site rămâne în moneda oficială: dacă anunțul e în EUR → la noi EUR; dacă e în Lei → Lei.
 */
export function detectCurrencyFromPriceText(priceText: string | null | undefined): LicitatiiCurrency {
  if (!priceText || typeof priceText !== "string") return "RON";
  const t = priceText.trim();
  if (/\b(Euro|EUR|€)\b/i.test(t)) return "EUR";
  return "RON";
}

/**
 * Parsează valoarea numerică din text.
 * - European: 1.200,00 sau 7.927,00 → punct = mii, virgulă = zecimale.
 * - American: 120,447.00 sau 770.00 → virgulă = mii, punct = zecimale (ca în schema.org / sursa „120,447.00 Euro”).
 * - Fără virgulă, cu punct: 7.927 → 7927 (punct = mii).
 */
export function parsePriceValueFromText(priceText: string | null | undefined): number {
  if (!priceText) return 0;
  const raw = priceText.replace(/\s/g, "");
  const match = raw.match(/[\d.,]+/);
  if (!match) return 0;
  const s = match[0];
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    // Atât virgulă cât și punct: zecimalele sunt după punct (American) sau după virgulă (European)
    // American: 120,447.00 Euro → zecimale după punct → virgulă = mii
    if (/\.\d{1,2}$/.test(s)) {
      normalized = s.replace(/,/g, "");
    } else {
      // European: 1.200,00 → zecimale după virgulă
      normalized = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    // Doar virgulă: european (virgulă = zecimale) sau mii (1,200)
    if (/,\d{1,2}$/.test(s)) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else {
    if (/\.\d{1,2}$/.test(s)) {
      normalized = s.replace(/,/g, "");
    } else {
      normalized = s.replace(/\./g, "").replace(/,/g, "");
    }
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Parsează preț + monedă din text (ex: "1.200,00 Euro" → { value: 1200, currency: 'EUR' }).
 */
export function parseLicitatiiPrice(priceText: string | null | undefined): ParsedLicitatiiPrice {
  const value = parsePriceValueFromText(priceText);
  const currency = detectCurrencyFromPriceText(priceText);
  return { value, currency };
}

const RON_EUR_FALLBACK_RATE = 5;

/**
 * Formatează valoare + monedă pentru afișare: virgulă = mii, punct = zecimale (ex: 120,447.00 EUR).
 */
export function formatLicitatiiPriceForDisplay(
  value: number,
  currency: LicitatiiCurrency,
  options?: { showEurEquivalent?: boolean; eurRate?: number }
): string {
  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decStr = decPart.toString().padStart(2, "0");
  const rate = options?.eurRate ?? RON_EUR_FALLBACK_RATE;
  if (currency === "EUR") {
    const main = `${intStr}.${decStr} EUR`;
    if (options?.showEurEquivalent) return main;
    return main;
  }
  const main = `${intStr}.${decStr} Lei`;
  if (options?.showEurEquivalent && value > 0) {
    const eur = value / rate;
    const eurStr = Math.floor(eur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${main} (≈ ${eurStr}.00 EUR)`;
  }
  return main;
}

/**
 * Formatează valoare + monedă în format european: punct = mii, virgulă = zecimale (ex: 120.447,00 EUR).
 * Folosit pentru produsul afișat pe site (transformă din american în european).
 */
export function formatLicitatiiPriceForDisplayEuropean(
  value: number,
  currency: LicitatiiCurrency,
  options?: { showEurEquivalent?: boolean; eurRate?: number }
): string {
  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decStr = decPart.toString().padStart(2, "0");
  const rate = options?.eurRate ?? RON_EUR_FALLBACK_RATE;
  if (currency === "EUR") {
    const main = `${intStr},${decStr} EUR`;
    if (options?.showEurEquivalent) return main;
    return main;
  }
  const main = `${intStr},${decStr} Lei`;
  if (options?.showEurEquivalent && value > 0) {
    const eur = value / rate;
    const eurStr = Math.floor(eur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${main} (≈ ${eurStr},00 EUR)`;
  }
  return main;
}

/**
 * Formatează price_text brut din sursă pentru afișare în admin/site:
 * parsează valoarea, detectează moneda, formatează uniform (120,447.00 EUR sau 7,927.00 Lei).
 */
export function formatPriceTextForDisplay(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return "—";
  const { value, currency } = parseLicitatiiPrice(raw);
  if (value === 0) return String(raw).trim();
  return formatLicitatiiPriceForDisplay(value, currency);
}

/**
 * Parsează prețul (american sau european) și îl formatează în european pentru produsul pe site (ex: 120.447,00 EUR).
 */
export function formatPriceTextForDisplayEuropean(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return "—";
  const { value, currency } = parseLicitatiiPrice(raw);
  if (value === 0) return String(raw).trim();
  return formatLicitatiiPriceForDisplayEuropean(value, currency);
}
