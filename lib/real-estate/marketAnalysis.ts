/**
 * Market Analysis Module - Detectează piață umflată, volatilitate și calculează discount-uri
 */

export interface MarketAnalysis {
  inflated_market: boolean;
  unsold_market_discount: number;
  volatility_score: number;
  piata_volatila: boolean;
  median_price: number;
  mean_price: number;
  std_dev: number;
  realistic_sale_rate: number;
  listing_rate: number;
}

/**
 * Analizează piața și detectează dacă este umflată
 */
export function analyzeMarket(
  comparables: Array<{ pret: number; pret_mp?: number; [key: string]: any }>,
  historicalRanges?: { min: number; max: number }
): MarketAnalysis {
  if (comparables.length === 0) {
    return {
      inflated_market: false,
      unsold_market_discount: 0,
      volatility_score: 0,
      piata_volatila: false,
      median_price: 0,
      mean_price: 0,
      std_dev: 0,
      realistic_sale_rate: 0.35,
      listing_rate: 1.0,
    };
  }

  // Extrage prețuri (folosește pret_mp dacă există, altfel pret)
  const prices = comparables
    .map(c => c.pret_mp || c.pret)
    .filter(p => p > 0 && isFinite(p));

  if (prices.length === 0) {
    return {
      inflated_market: false,
      unsold_market_discount: 0,
      volatility_score: 0,
      piata_volatila: false,
      median_price: 0,
      mean_price: 0,
      std_dev: 0,
      realistic_sale_rate: 0.35,
      listing_rate: 1.0,
    };
  }

  // Calculează statistici
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Calculează deviația standard
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const std_dev = Math.sqrt(variance);

  // Calculează scorul de volatilitate
  const volatility_score = mean > 0 ? std_dev / mean : 0;

  // Detectează piață umflată
  let inflated_market = false;
  if (historicalRanges) {
    const historicalMean = (historicalRanges.min + historicalRanges.max) / 2;
    const deviation = Math.abs(mean - historicalMean) / historicalMean;
    if (deviation > 0.30) {
      inflated_market = true;
    }
  } else {
    // Dacă nu avem range istoric, folosim o euristică bazată pe volatilitate
    // Dacă volatilitatea este foarte mare, probabil piața este umflată
    if (volatility_score > 0.40) {
      inflated_market = true;
    }
  }

  // Calculează discount pentru piață nesolvată
  const realistic_sale_rate = 0.35; // 35% din listări se vând efectiv
  const listing_rate = 1.0; // 100% din listări sunt disponibile
  const unsold_market_discount = 1 - (realistic_sale_rate / listing_rate); // ≈ 0.65

  // Detectează piață volatilă
  const piata_volatila = volatility_score > 0.25;

  return {
    inflated_market,
    unsold_market_discount,
    volatility_score,
    piata_volatila,
    median_price: median,
    mean_price: mean,
    std_dev,
    realistic_sale_rate,
    listing_rate,
  };
}

/**
 * Filtrează comparabilele bazat pe volatilitate
 */
export function filterByVolatility(
  comparables: Array<{ pret: number; pret_mp?: number; [key: string]: any }>,
  volatility_score: number
): Array<{ pret: number; pret_mp?: number; [key: string]: any }> {
  if (volatility_score <= 0.25) {
    return comparables; // Nu filtra dacă volatilitatea este mică
  }

  const prices = comparables.map(c => c.pret_mp || c.pret).filter(p => p > 0);
  if (prices.length === 0) {
    return comparables;
  }

  const sorted = [...prices].sort((a, b) => a - b);
  
  if (volatility_score > 0.50) {
    // Folosește doar mediană (elimină top 50% și bottom 50%)
    const median = sorted[Math.floor(sorted.length / 2)];
    return comparables.filter(c => {
      const price = c.pret_mp || c.pret;
      return Math.abs(price - median) / median < 0.1; // Doar ±10% față de mediană
    });
  } else if (volatility_score > 0.40) {
    // Elimină top 25% și bottom 20%
    const top25Index = Math.floor(sorted.length * 0.75);
    const bottom20Index = Math.floor(sorted.length * 0.20);
    const top25Price = sorted[top25Index];
    const bottom20Price = sorted[bottom20Index];
    
    return comparables.filter(c => {
      const price = c.pret_mp || c.pret;
      return price >= bottom20Price && price <= top25Price;
    });
  } else {
    // Elimină top 25% și bottom 20%
    const top25Index = Math.floor(sorted.length * 0.75);
    const bottom20Index = Math.floor(sorted.length * 0.20);
    const top25Price = sorted[top25Index];
    const bottom20Price = sorted[bottom20Index];
    
    return comparables.filter(c => {
      const price = c.pret_mp || c.pret;
      return price >= bottom20Price && price <= top25Price;
    });
  }
}

/**
 * Aplică corecții bazate pe volatilitate
 */
export function applyVolatilityCorrection(
  value: number,
  volatility_score: number
): number {
  if (volatility_score > 0.40) {
    return value * 0.90; // -10% corecție
  }
  return value;
}

