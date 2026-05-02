import { PriceRanges, PriceLevel } from "./types/priceEvaluation";

/**
 * Filtrează outliers folosind metoda IQR (Interquartile Range) mai agresiv
 * Adaugă și validare bazată pe categoria produsului
 */
function filterOutliers(prices: number[], category?: string, product?: { attributes?: Record<string, any>; title?: string; description?: string }): number[] {
  if (prices.length < 4) return prices;

  const sorted = [...prices].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Folosim un factor FOARTE strict (0.5) pentru a elimina și mai mulți outliers
  let lowerBound = q1 - 0.5 * iqr;
  let upperBound = q3 + 0.5 * iqr;
  
  // Validare suplimentară bazată pe categorie
  if (category === "apartment" || category === "imobiliare") {
    lowerBound = Math.max(lowerBound, 30000);
    upperBound = Math.min(upperBound, 800000);
  } else if (category === "auto") {
    lowerBound = Math.max(lowerBound, 2000);
    upperBound = Math.min(upperBound, 150000);
  } else if (category === "land" || category === "teren") {
    lowerBound = Math.max(lowerBound, 10000);
    upperBound = Math.min(upperBound, 1000000);
  } else if (category === "house" || category === "casa" || category === "vila") {
    // Pentru case, verifică dacă este micro-teren sau casă veche
    if (product) {
      const titleLower = (product.title || '').toLowerCase();
      const descLower = (product.description || '').toLowerCase();
      const fullText = `${titleLower} ${descLower}`;
      
      // Detectare micro-teren
      const terenMatch = fullText.match(/(\d+)\s*(?:mp|m²|metri)\s*(?:teren|terenu)/i) || 
                         fullText.match(/teren[:\s]+(\d+)\s*(?:mp|m²)/i);
      const suprafataTeren = terenMatch ? parseInt(terenMatch[1]) : 
                            (product.attributes?.suprafata_teren || product.attributes?.suprafataTeren);
      const isMicroTeren = suprafataTeren && suprafataTeren < 150;
      
      // Detectare casă veche
      const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i) ||
                              product.attributes?.year || product.attributes?.an;
      const hasRenovari = fullText.includes('renovat') || fullText.includes('renovație') ||
                          product.attributes?.renovated || product.attributes?.renovat;
      const isCasaVeche = !hasAnConstructie && !hasRenovari;
      
      if (isMicroTeren) {
        // MICRO-TEREN: Foarte strict (5k - 20k EUR)
        lowerBound = Math.max(lowerBound, 5000);
        upperBound = Math.min(upperBound, 20000);
      } else if (isCasaVeche) {
        // CASĂ VECHE: Strict (10k - 50k EUR)
        lowerBound = Math.max(lowerBound, 10000);
        upperBound = Math.min(upperBound, 50000);
      } else {
        // CASĂ NORMALĂ: 20k - 500k EUR
        lowerBound = Math.max(lowerBound, 20000);
        upperBound = Math.min(upperBound, 500000);
      }
    } else {
      // Default pentru case
      lowerBound = Math.max(lowerBound, 20000);
      upperBound = Math.min(upperBound, 500000);
    }
  }
  
  // Elimină prețurile care depășesc cu mult mediană (mai mult de 3x sau mai puțin de 0.1x)
  const filtered = sorted.filter(p => {
    if (p > median * 3 || p < median * 0.1) {
      return false; // Elimină outliers extreme
    }
    return p >= lowerBound && p <= upperBound;
  });
  
  // Dacă după filtrare avem prea puține prețuri, folosim toate (dar cu limitele stricte)
  if (filtered.length < Math.max(5, sorted.length * 0.2)) {
    // Folosim limitele stricte, dar acceptăm toate prețurile din range
    return sorted.filter(p => {
      // Elimină outliers extreme (mai mult de 3x mediană)
      if (p > median * 3 || p < median * 0.1) {
        return false;
      }
      
      if (category === "apartment" || category === "imobiliare") {
        return p >= 30000 && p <= 800000;
      } else if (category === "auto") {
        return p >= 2000 && p <= 150000;
      } else if (category === "land" || category === "teren") {
        return p >= 10000 && p <= 1000000;
      } else if (category === "house" || category === "casa" || category === "vila") {
        // Pentru case, verifică din nou micro-teren/casă veche
        if (product) {
          const titleLower = (product.title || '').toLowerCase();
          const descLower = (product.description || '').toLowerCase();
          const fullText = `${titleLower} ${descLower}`;
          const terenMatch = fullText.match(/(\d+)\s*(?:mp|m²|metri)\s*(?:teren|terenu)/i);
          const suprafataTeren = terenMatch ? parseInt(terenMatch[1]) : 
                                (product.attributes?.suprafata_teren || product.attributes?.suprafataTeren);
          const isMicroTeren = suprafataTeren && suprafataTeren < 150;
          const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i) ||
                                  product.attributes?.year || product.attributes?.an;
          const hasRenovari = fullText.includes('renovat') || product.attributes?.renovated;
          const isCasaVeche = !hasAnConstructie && !hasRenovari;
          
          if (isMicroTeren) {
            return p >= 5000 && p <= 20000;
          } else if (isCasaVeche) {
            return p >= 10000 && p <= 50000;
          }
        }
        return p >= 20000 && p <= 500000;
      }
      return p >= lowerBound && p <= upperBound;
    });
  }
  
  return filtered;
}

/**
 * Calculează intervalele de preț pe baza prețurilor găsite
 * Folosește cuantile (percentile) pentru a obține intervale realiste bazate pe distribuția reală
 */
export function computePriceRangesFromSamples(
  prices: number[], 
  category?: string,
  product?: { attributes?: Record<string, any>; title?: string; description?: string }
): PriceRanges {
  if (prices.length === 0) {
    throw new Error("Cannot compute ranges from empty price array");
  }

  // FILTRARE PRELIMINARĂ: Elimină outliers extreme înainte de orice altă procesare
  let pricesToFilter = filterOutliers(prices, category, product);
  
  // Pentru imobiliare, aplică filtrare strictă bazată pe micro-teren, casă veche, licitație
  if ((category === "house" || category === "casa" || category === "vila" || category === "imobiliare") && product) {
    const titleLower = (product.title || '').toLowerCase();
    const descLower = (product.attributes?.description || '').toLowerCase();
    const fullText = `${titleLower} ${descLower}`;
    
    // Detectare micro-teren (<150 mp teren)
    const terenMatch = fullText.match(/(\d+)\s*(?:mp|m²|metri)\s*(?:teren|terenu)/i) || 
                       fullText.match(/teren[:\s]+(\d+)\s*(?:mp|m²)/i);
    const suprafataTeren = terenMatch ? parseInt(terenMatch[1]) : 
                          (product.attributes?.suprafata_teren || product.attributes?.suprafataTeren);
    const isMicroTeren = suprafataTeren && suprafataTeren < 150;
    
    // Detectare licitație
    const isLicitatie = fullText.includes('licitație') || fullText.includes('licitatie') ||
                        fullText.includes('executare') || fullText.includes('anaf') ||
                        fullText.includes('preț de pornire') || fullText.includes('pret de pornire');
    
    // Detectare casă veche
    const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i) ||
                            product.attributes?.year || product.attributes?.an;
    const hasRenovari = fullText.includes('renovat') || fullText.includes('renovație') ||
                        product.attributes?.renovated || product.attributes?.renovat;
    const isCasaVeche = !hasAnConstructie && !hasRenovari;
    
    if (isMicroTeren) {
      // MICRO-TEREN: Filtrează strict (5k - 20k EUR)
      const beforeFilter = pricesToFilter.length;
      pricesToFilter = pricesToFilter.filter(p => p >= 5000 && p <= 20000);
      
      // Dacă este licitație, aplică reducere suplimentară
      if (isLicitatie) {
        pricesToFilter = pricesToFilter.map(p => Math.round(p * 0.5));
      }
      
      console.log(`[PriceLogic] Filtered micro-teren prices: ${beforeFilter} -> ${pricesToFilter.length}, range: 5k-20k EUR${isLicitatie ? ' (with 50% licitație reduction)' : ''}`);
    } else if (isCasaVeche) {
      // CASĂ VECHE: Filtrează strict (10k - 50k EUR)
      const beforeFilter = pricesToFilter.length;
      pricesToFilter = pricesToFilter.filter(p => p >= 10000 && p <= 50000);
      
      // Dacă este licitație, aplică reducere suplimentară
      if (isLicitatie) {
        pricesToFilter = pricesToFilter.map(p => Math.round(p * 0.5));
      }
      
      console.log(`[PriceLogic] Filtered casă veche prices: ${beforeFilter} -> ${pricesToFilter.length}, range: 10k-50k EUR${isLicitatie ? ' (with 50% licitație reduction)' : ''}`);
    } else if (isLicitatie) {
      // LICITAȚIE (fără micro-teren sau casă veche): Aplică reducere 40-60%
      const beforeFilter = pricesToFilter.length;
      pricesToFilter = pricesToFilter.map(p => Math.round(p * 0.5)); // Reducere 50%
      // Filtrează după reducere (20k - 200k EUR)
      pricesToFilter = pricesToFilter.filter(p => p >= 20000 && p <= 200000);
      console.log(`[PriceLogic] Applied 50% reduction for licitație: ${beforeFilter} -> ${pricesToFilter.length} prices`);
    } else {
      // CASĂ NORMALĂ: Filtrează normal (20k - 500k EUR)
      const beforeFilter = pricesToFilter.length;
      pricesToFilter = pricesToFilter.filter(p => p >= 20000 && p <= 500000);
      console.log(`[PriceLogic] Filtered normal house prices: ${beforeFilter} -> ${pricesToFilter.length}, range: 20k-500k EUR`);
    }
    
    // Dacă după filtrare avem prea puține prețuri, folosim toate (dar cu reduceri aplicate)
    if (pricesToFilter.length < 5) {
      console.warn(`[PriceLogic] Too few filtered prices (${pricesToFilter.length}), using all prices with applied reductions`);
    }
  }
  
  // Pentru mașini, aplică filtrare strictă bazată pe an
  if (category === "auto" && product?.attributes?.year) {
    const currentYear = new Date().getFullYear();
    const carYear = parseInt(String(product.attributes.year));
    const age = currentYear - carYear;
    
    // Calculează range realist bazat pe vârstă
    let maxRealisticPrice = 50000; // Default pentru mașini noi
    if (age >= 20) {
      maxRealisticPrice = 5000;
    } else if (age >= 15) {
      maxRealisticPrice = 7000;
    } else if (age >= 10) {
      maxRealisticPrice = 12000;
    } else if (age >= 5) {
      maxRealisticPrice = 25000;
    }
    
    // Filtrează prețurile care sunt prea mari pentru vârsta mașinii (FOARTE strict)
    pricesToFilter = pricesToFilter.filter(p => p <= maxRealisticPrice * 1.1); // Permite doar 10% variație
    
    // Dacă după filtrare avem prea puține prețuri, relaxăm puțin
    if (pricesToFilter.length < 5) {
      pricesToFilter = pricesToFilter.filter(p => p <= maxRealisticPrice * 1.2);
    }
    
    console.log(`[PriceLogic] Filtered car prices for year ${carYear} (age ${age}): ${prices.length} -> ${pricesToFilter.length}, max realistic: ${maxRealisticPrice} EUR`);
  }
  
  // Pentru utilaje, aplică filtrare strictă bazată pe an și ore de funcționare
  if ((category === "construction_equipment" || category === "utilaje_construcții" || category === "utilaje" ||
       category === "agricultural_equipment" || category === "utilaje_agricole") && 
      product?.attributes?.year && product?.attributes?.hours) {
    const currentYear = new Date().getFullYear();
    const equipmentYear = parseInt(String(product.attributes.year || product.attributes.an));
    const equipmentHours = parseInt(String(product.attributes.hours || product.attributes.ore || product.attributes.ore_funcionare));
    const age = currentYear - equipmentYear;
    
    // Calculează ore așteptate (3000 ore/an pentru utilaje construcții, 400 ore/an pentru agricole)
    const expectedHoursPerYear = category === "agricultural_equipment" || category === "utilaje_agricole" ? 400 : 3000;
    const expectedHours = age * expectedHoursPerYear;
    
    // Filtrează prețurile bazate pe diferența de ore (±30% toleranță)
    if (equipmentHours && expectedHours) {
      const minHours = expectedHours * 0.7;
      const maxHours = expectedHours * 1.3;
      
      // Dacă orele diferă prea mult, ajustează range-ul de preț
      if (equipmentHours > maxHours) {
        // Foarte mult folosit: reduce range-ul maxim
        const reductionFactor = Math.min(equipmentHours / maxHours, 2); // Max 2x reducere
        pricesToFilter = prices.filter(p => {
          // Ajustează prețul maxim bazat pe ore
          const adjustedMax = Math.max(...prices) / reductionFactor;
          return p <= adjustedMax;
        });
      } else if (equipmentHours < minHours) {
        // Puțin folosit: permite prețuri mai mari
        // Nu filtrează, doar logăm
        console.log(`[PriceLogic] Equipment with low hours (${equipmentHours} vs expected ${expectedHours}), allowing higher prices`);
      }
      
      console.log(`[PriceLogic] Filtered equipment prices for year ${equipmentYear} (age ${age}), hours ${equipmentHours} (expected ${expectedHours}): ${prices.length} -> ${pricesToFilter.length}`);
    }
  }

  // FILTRARE FINALĂ: Elimină outliers după toate ajustările
  // Nu mai apelăm filterOutliers aici pentru că l-am apelat deja la început
  // Dar aplicăm o filtrare finală bazată pe mediană pentru a elimina outliers extreme
  const sorted = [...pricesToFilter].sort((a, b) => a - b);
  
  // Verifică dacă avem prețuri după filtrare
  if (sorted.length === 0) {
    console.warn(`[PriceLogic] No prices after filtering, using original prices (${prices.length} prices)`);
    // Folosim prețurile originale, dar cu filtrare minimă
    const originalSorted = [...prices].sort((a, b) => a - b);
    const min = originalSorted[0];
    const max = originalSorted[originalSorted.length - 1];
    const spread = max - min;
    
    return {
      very_good: [min, min + spread * 0.2],
      good: [min + spread * 0.2, min + spread * 0.4],
      fair: [min + spread * 0.4, min + spread * 0.6],
      high: [min + spread * 0.6, min + spread * 0.8],
      very_high: [min + spread * 0.8, max],
    };
  }
  
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Verifică dacă mediană este validă (nu este 0 sau NaN)
  if (!median || median === 0 || isNaN(median)) {
    console.warn(`[PriceLogic] Invalid median (${median}), skipping median-based filtering`);
    // Folosim prețurile sortate fără filtrare suplimentară
    const pricesToUse = sorted;
    const min = pricesToUse[0];
    const max = pricesToUse[pricesToUse.length - 1];
    const spread = max - min;
    
    return {
      very_good: [min, min + spread * 0.2],
      good: [min + spread * 0.2, min + spread * 0.4],
      fair: [min + spread * 0.4, min + spread * 0.6],
      high: [min + spread * 0.6, min + spread * 0.8],
      very_high: [min + spread * 0.8, max],
    };
  }
  
  // Elimină prețurile care sunt mai mult de 2.5x sau mai puțin de 0.3x față de mediană
  const finalFiltered = sorted.filter(p => {
    // Elimină outliers extreme
    if (p > median * 2.5 || p < median * 0.3) {
      return false;
    }
    return true;
  });
  
  // Folosim prețurile filtrate final, sau dacă nu avem suficiente, folosim cele filtrate anterior
  let pricesToUse = finalFiltered.length >= 5 ? finalFiltered : sorted;
  
  // Dacă încă nu avem prețuri, folosim prețurile originale (relaxăm filtrarea)
  if (pricesToUse.length === 0) {
    console.warn(`[PriceLogic] All prices filtered out, using original prices (${prices.length} prices)`);
    pricesToUse = [...prices].sort((a, b) => a - b);
  }
  
  // Dacă încă nu avem prețuri (nu ar trebui să se întâmple), folosim un fallback
  if (pricesToUse.length === 0) {
    console.error(`[PriceLogic] CRITICAL: No prices available at all, using fallback`);
    // Fallback: generează prețuri bazate pe prețul produsului
    const productPrice = product?.attributes?.price || 10000;
    pricesToUse = [
      Math.round(productPrice * 0.5),
      Math.round(productPrice * 0.7),
      Math.round(productPrice * 0.9),
      Math.round(productPrice * 1.1),
      Math.round(productPrice * 1.3),
    ];
  }
  
  const min = pricesToUse[0];
  const max = pricesToUse[pricesToUse.length - 1];

  // Calculează cuantile (percentile) pentru intervale realiste
  // Q0 (min) - Q20 pentru very_good
  // Q20 - Q40 pentru good
  // Q40 - Q60 pentru fair
  // Q60 - Q80 pentru high
  // Q80 - Q100 (max) pentru very_high
  const q20Index = Math.max(0, Math.floor(pricesToUse.length * 0.2));
  const q40Index = Math.max(0, Math.floor(pricesToUse.length * 0.4));
  const q60Index = Math.max(0, Math.floor(pricesToUse.length * 0.6));
  const q80Index = Math.max(0, Math.floor(pricesToUse.length * 0.8));

  const q20 = pricesToUse[q20Index] || min;
  const q40 = pricesToUse[q40Index] || (q20 || min);
  const q60 = pricesToUse[q60Index] || (q40 || q20 || min);
  const q80 = pricesToUse[q80Index] || (q60 || q40 || q20 || min);

  // VALIDARE FINALĂ: Asigură-te că intervalele sunt în ordine crescătoare
  const validatedRanges: PriceRanges = {
    very_good: [min, Math.max(min, q20)] as [number, number],
    good: [Math.max(min, q20), Math.max(q20, q40)] as [number, number],
    fair: [Math.max(q20, q40), Math.max(q40, q60)] as [number, number],
    high: [Math.max(q40, q60), Math.max(q60, q80)] as [number, number],
    very_high: [Math.max(q60, q80), max] as [number, number],
  };
  
  // Log pentru debugging
  console.log(`[PriceLogic] Final price ranges for ${category}:`, {
    min,
    q20,
    q40,
    q60,
    q80,
    max,
    samples: pricesToUse.length,
  });

  return validatedRanges;
}

/**
 * Clasifică un preț în una dintre categoriile definite
 * Folosește intervalele calculate bazate pe cuantile
 */
export function classifyPrice(price: number, ranges: PriceRanges): PriceLevel {
  // Verifică în ce interval se încadrează prețul
  // Folosim >= pentru început și <= pentru sfârșit pentru a include limitele
  if (price >= ranges.very_good[0] && price <= ranges.very_good[1]) {
    return "very_good";
  } else if (price > ranges.very_good[1] && price <= ranges.good[1]) {
    return "good";
  } else if (price > ranges.good[1] && price <= ranges.fair[1]) {
    return "fair";
  } else if (price > ranges.fair[1] && price <= ranges.high[1]) {
    return "high";
  } else if (price > ranges.high[1] && price <= ranges.very_high[1]) {
    return "very_high";
  } else {
    // Dacă prețul este în afara intervalelor, clasifică-l bazat pe poziție relativă
    if (price < ranges.very_good[0]) {
      return "very_good"; // Sub minim, considerăm foarte bun
    } else {
      return "very_high"; // Peste maxim, considerăm ridicat
    }
  }
}

/**
 * Construiește un query de căutare inteligent pe baza produsului
 */
export function buildSearchQueryForProduct(product: {
  title: string;
  category: string;
  city?: string;
  area?: string;
  attributes?: Record<string, any>;
}): string {
  const { title, category, city, area, attributes } = product;
  const parts: string[] = [];

  // Detectează subcategoria pentru autovehicule
  const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                      (category === "auto" ? "autoturisme" : null);
  const titleLower = title.toLowerCase();
  
  // Detectare automată subcategorie din titlu
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('suv') || titleLower.includes('4x4') || titleLower.includes('awd')) {
      detectedSubcategory = "suv";
    } else if (titleLower.includes('motocicletă') || titleLower.includes('motocicleta') || 
               titleLower.includes('scuter') || titleLower.includes('motorcycle') || 
               titleLower.includes('harley') || titleLower.includes('yamaha') || 
               titleLower.includes('honda') || titleLower.includes('kawasaki')) {
      detectedSubcategory = "motociclete";
    } else if (titleLower.includes('camion') || titleLower.includes('truck') || 
               titleLower.includes('man') || titleLower.includes('scania') || 
               titleLower.includes('volvo') || titleLower.includes('daf')) {
      detectedSubcategory = "camioane";
    } else if (titleLower.includes('remorcă') || titleLower.includes('remorca') || 
               titleLower.includes('semiremorcă') || titleLower.includes('semiremorca') || 
               titleLower.includes('trailer')) {
      detectedSubcategory = "remorci";
    } else if (titleLower.includes('autorulotă') || titleLower.includes('autorulota') || 
               titleLower.includes('rulotă') || titleLower.includes('rulota') || 
               titleLower.includes('motorhome') || titleLower.includes('caravan')) {
      detectedSubcategory = "autorulote";
    } else if (titleLower.includes('tesla') || titleLower.includes('electric') || 
               titleLower.includes('electrică') || titleLower.includes('ev') || 
               titleLower.includes('hybrid') || titleLower.includes('hibrid')) {
      detectedSubcategory = "electrice";
    } else if (titleLower.includes('piesă') || titleLower.includes('piesa') || 
               titleLower.includes('accesoriu') || titleLower.includes('alternator') || 
               titleLower.includes('cutie') || titleLower.includes('turbină') || 
               titleLower.includes('turbina') || titleLower.includes('jantă') || 
               titleLower.includes('janta')) {
      detectedSubcategory = "piese";
    } else {
      detectedSubcategory = "autoturisme";
    }
  }
  
  if (category === "auto" || category === "autovehicule") {
    if (detectedSubcategory === "suv" || detectedSubcategory === "suv_4x4") {
      // SUV / 4x4
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) parts.push(attributes.model);
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.engine || attributes?.motorizare) parts.push(attributes.engine || attributes.motorizare);
      if (attributes?.fuel || attributes?.combustibil) parts.push(attributes.fuel || attributes.combustibil);
      if (attributes?.km || attributes?.kilometraj) parts.push(`${attributes.km || attributes.kilometraj} km`);
      if (attributes?.drive || attributes?.tractiune || attributes?.tracțiune) {
        parts.push(attributes.drive || attributes.tractiune || attributes.tracțiune);
      }
      
      parts.push("SUV", "4x4", "de vanzare", "România");
    if (city) parts.push(city);
    } else if (detectedSubcategory === "motociclete" || detectedSubcategory === "scutere") {
      // Motociclete și Scutere
      // Query: "Yamaha MT07 2017 25000 km de vanzare"
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) parts.push(attributes.model);
      if (attributes?.displacement || attributes?.cilindree || attributes?.cc) {
        parts.push(`${attributes.displacement || attributes.cilindree || attributes.cc}cc`);
      }
      if (attributes?.type || attributes?.tip) parts.push(attributes.type || attributes.tip);
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.km || attributes?.kilometraj) parts.push(`${attributes.km || attributes.kilometraj} km`);
      if (attributes?.power || attributes?.putere) parts.push(`${attributes.power || attributes.putere}CP`);
      
      parts.push("motocicleta", "de vanzare", "România");
    if (city) parts.push(city);
    } else if (detectedSubcategory === "camioane") {
      // Camioane
      // Query: "MAN TGS 2016 18.440 Euro6 prelata 800000 km de vanzare"
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) parts.push(attributes.model);
      if (attributes?.tonnage || attributes?.tonaj) parts.push(`${attributes.tonnage || attributes.tonaj}T`);
      if (attributes?.power || attributes?.putere || attributes?.hp) {
        parts.push(`${attributes.power || attributes.putere || attributes.hp}CP`);
      }
      if (attributes?.euro || attributes?.euro_norm) parts.push(`Euro${attributes.euro || attributes.euro_norm}`);
      if (attributes?.body || attributes?.caroserie) parts.push(attributes.body || attributes.caroserie);
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.km || attributes?.kilometraj) parts.push(`${attributes.km || attributes.kilometraj} km`);
      if (attributes?.axles || attributes?.axe || attributes?.configuratie_axe) {
        parts.push(attributes.axles || attributes.axe || attributes.configuratie_axe);
      }
      
      parts.push("camion", "de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "remorci" || detectedSubcategory === "semiremorci") {
      // Remorci și Semiremorci
      // Query: "semiremorca Schmitz 2014 prelata 3 axe de vanzare"
      if (attributes?.type || attributes?.tip) {
        parts.push(attributes.type || attributes.tip);
      } else {
        parts.push(titleLower.includes('semiremorcă') || titleLower.includes('semiremorca') ? "semiremorca" : "remorca");
      }
      
      if (attributes?.brand || attributes?.marca) parts.push(attributes.brand || attributes.marca);
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.body || attributes?.caroserie || attributes?.tip_caroserie) {
        parts.push(attributes.body || attributes.caroserie || attributes.tip_caroserie);
      }
      if (attributes?.axles || attributes?.axe) parts.push(`${attributes.axles || attributes.axe} axe`);
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "autorulote" || detectedSubcategory === "rulote") {
      // Autorulote / Rulote
      // Query: "autorulota Fiat Ducato 2018 130CP 100000 km de vanzare"
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) parts.push(attributes.model);
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.power || attributes?.putere) parts.push(`${attributes.power || attributes.putere}CP`);
      if (attributes?.km || attributes?.kilometraj) parts.push(`${attributes.km || attributes.kilometraj} km`);
      if (attributes?.seats || attributes?.locuri) parts.push(`${attributes.seats || attributes.locuri} locuri`);
      
      parts.push("autorulota", "motorhome", "de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "electrice" || detectedSubcategory === "vehicule_electrice") {
      // Vehicule Electrice
      // Query: "Tesla Model 3 2019 Standard Range 70k km de vanzare"
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) parts.push(attributes.model);
      if (attributes?.battery || attributes?.baterie || attributes?.kwh) {
        parts.push(`${attributes.battery || attributes.baterie || attributes.kwh}kWh`);
      }
      if (attributes?.range || attributes?.autonomie || attributes?.autonomie_wltp) {
        parts.push(`${attributes.range || attributes.autonomie || attributes.autonomie_wltp}km autonomie`);
      }
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.km || attributes?.kilometraj) parts.push(`${attributes.km || attributes.kilometraj} km`);
      
      parts.push("electric", "EV", "de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "piese" || detectedSubcategory === "piese_auto") {
      // Piese Auto și Accesorii
      // Query: "alternator VW Golf 5 1.9 TDI original de vanzare"
      if (attributes?.part || attributes?.piesa || attributes?.tip_piesa) {
        parts.push(attributes.part || attributes.piesa || attributes.tip_piesa);
      } else {
        // Încearcă să extragă din titlu
        const partKeywords = ['alternator', 'cutie', 'turbină', 'turbina', 'jantă', 'janta', 'amortizor', 'filtru'];
        for (const keyword of partKeywords) {
          if (titleLower.includes(keyword)) {
            parts.push(keyword);
            break;
          }
        }
      }
      
      // Brand = brandul MAȘINII (VW, BMW), model, capacitate cilindrică, an obligatorii pentru precizie
      if (attributes?.brand || attributes?.marca) parts.push(attributes.brand || attributes.marca);
      if (attributes?.model || attributes?.model_compatibil) {
        parts.push(attributes.model || attributes.model_compatibil);
      }
      if (attributes?.capacitate_cilindrica ?? attributes?.capacitateCilindrica ?? attributes?.engine ?? attributes?.motorizare) {
        parts.push(String(attributes.capacitate_cilindrica ?? attributes.capacitateCilindrica ?? attributes.engine ?? attributes.motorizare));
      }
      if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
      if (attributes?.condition || attributes?.stare || attributes?.type_part) {
        parts.push(attributes.condition || attributes.stare || attributes.type_part);
      }
      
      parts.push("piesa auto", "de vanzare", "România");
      if (city) parts.push(city);
    } else {
      // Autoturisme (default)
      // Query: "VW Golf 2009 1.4 benzina 150000 km de vanzare Romania"
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      if (attributes?.model) {
        parts.push(attributes.model);
      } else {
        const modelFromTitle = title.split(" ").slice(1, 2).join(" ");
        if (modelFromTitle) parts.push(modelFromTitle);
      }
      
      if (attributes?.year || attributes?.an) {
        parts.push(attributes.year || attributes.an);
      }
      
      if (attributes?.engine || attributes?.motorizare) {
        parts.push(attributes.engine || attributes.motorizare);
      }
      
      if (attributes?.fuel || attributes?.combustibil || attributes?.tip_combustibil) {
        parts.push(attributes.fuel || attributes.combustibil || attributes.tip_combustibil);
      }
      
      if (attributes?.km || attributes?.kilometraj) {
        parts.push(`${attributes.km || attributes.kilometraj} km`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "apartment" || category === "imobiliare") {
    // Apartamente
    // Query: "apartament {camere} camere {suprafata} mp {zona} {oras} {an} de vanzare bloc {nou/vechi}"
    parts.push("apartament");
    
    // Număr camere (CRITIC pentru filtrare)
    if (attributes?.rooms || attributes?.camere || attributes?.numar_camere) {
      parts.push(`${attributes.rooms || attributes.camere || attributes.numar_camere} camere`);
    } else {
      // Extrage din titlu
    const roomsMatch = title.match(/(\d+)\s*camere?/i);
    if (roomsMatch) parts.push(`${roomsMatch[1]} camere`);
    }
    
    // Suprafață utilă (mp) - CRITIC pentru filtrare (±10%)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_utila || attributes?.mp) {
      parts.push(`${attributes.surface || attributes.suprafata || attributes.suprafata_utila || attributes.mp} mp`);
    }
    
    // Zona / cartier (CRITICĂ pentru filtrare)
    if (area) parts.push(area);
    if (attributes?.zone || attributes?.cartier || attributes?.sector) {
      parts.push(attributes.zone || attributes.cartier || attributes.sector);
    }
    
    // Orașul
    if (city) parts.push(city);
    
    // Anul construcției (±5 ani pentru filtrare)
    if (attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_construcție) {
      parts.push(attributes.year || attributes.an || attributes.anConstructie || attributes.an_construcție);
    }
    
    // Bloc nou / vechi
    const year = attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_construcție;
    if (year) {
      const yearNum = parseInt(String(year));
      if (yearNum >= 2000) {
        parts.push("bloc nou");
      } else if (yearNum < 1990) {
        parts.push("bloc vechi");
      }
    } else if (attributes?.construction_type || attributes?.tip_constructie) {
      parts.push(attributes.construction_type || attributes.tip_constructie);
    }
    
    // Etaj (similar pentru filtrare: intermediar vs parter vs ultim)
    if (attributes?.floor || attributes?.etaj) {
      const floor = attributes.floor || attributes.etaj;
      const totalFloors = attributes?.totalFloors || attributes?.total_etaje || attributes?.totalEtaje;
      if (totalFloors) {
        parts.push(`etaj ${floor}/${totalFloors}`);
      } else {
        parts.push(`etaj ${floor}`);
      }
    }
    
    // Compartimentare (identică pentru filtrare)
    if (attributes?.compartimentare || attributes?.layout) {
      parts.push(attributes.compartimentare || attributes.layout);
    }
    
    // Lift
    if (attributes?.lift || attributes?.elevator) {
      parts.push(attributes.lift || attributes.elevator ? "cu lift" : "fara lift");
    }
    
    // Îmbunătățiri
    if (attributes?.renovated || attributes?.renovat) {
      parts.push(attributes.renovated || attributes.renovat);
    }
    if (attributes?.lux || attributes?.luxury) {
      parts.push("lux");
    }
    if (attributes?.furnished || attributes?.mobilat) {
      parts.push(attributes.furnished || attributes.mobilat ? "mobilat" : "nemobilat");
    }
    if (attributes?.centrala || attributes?.centrala_proprie) {
      parts.push("centrala proprie");
    }
    
    // Parcare
    if (attributes?.parking || attributes?.parcare) {
      parts.push(attributes.parking || attributes.parcare ? "cu parcare" : "fara parcare");
    }
    
    parts.push("de vanzare", "România");
  } else if (category === "house" || category === "vila" || category === "casa") {
    parts.push("casă de vânzare", "vila de vânzare", "preț");
    
    // 1. Oraș / zonă / stradă
    if (city) parts.push(city);
    if (area) parts.push(area);
    if (attributes?.zone || attributes?.cartier) {
      parts.push(attributes.zone || attributes.cartier);
    }
    
    // 2. Suprafața construită / utilă
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_construita || attributes?.suprafata_utila) {
      parts.push(`${attributes.surface || attributes.suprafata || attributes.suprafata_construita || attributes.suprafata_utila} mp`);
    }
    
    // 3. Suprafața terenului
    if (attributes?.land || attributes?.teren || attributes?.suprafata_teren) {
      parts.push(`teren ${attributes.land || attributes.teren || attributes.suprafata_teren} mp`);
    }
    
    // 4. Anul construcției
    if (attributes?.year || attributes?.an || attributes?.anConstructie) {
      parts.push(`an ${attributes.year || attributes.an || attributes.anConstructie}`);
    }
    
    // 5. Material structură
    if (attributes?.structure || attributes?.material || attributes?.structura) {
      parts.push(attributes.structure || attributes.material || attributes.structura);
    }
    
    // 6. Structură niveluri
    if (attributes?.levels || attributes?.niveluri || attributes?.etaje) {
      parts.push(attributes.levels || attributes.niveluri || attributes.etaje);
    }
    
    // 7. Curte amenajată / acces auto / garaj
    if (attributes?.yard || attributes?.curte) {
      parts.push(attributes.yard || attributes.curte);
    }
    if (attributes?.garage || attributes?.garaj) {
      parts.push(attributes.garage || attributes.garaj ? "cu garaj" : "fără garaj");
    }
    
    // 8. Renovări / finisaje
    if (attributes?.renovated || attributes?.renovat) {
      parts.push(attributes.renovated || attributes.renovat);
    }
    
    // 9. Utilități
    if (attributes?.utilities || attributes?.utilitati) {
      parts.push(attributes.utilities || attributes.utilitati);
    }
    
    parts.push("România");
  } else if (category === "land" || category === "teren") {
    // Detectează tip teren: intravilan vs agricol
    const landType = attributes?.land_type || attributes?.tip_teren || 
                     (attributes?.intravilan === true || attributes?.intravilan === 'true' ? "intravilan" : null) ||
                     (attributes?.agricol === true || attributes?.agricol === 'true' ? "agricol" : null);
    const titleLower = title.toLowerCase();
    const isAgricultural = landType === "agricol" || titleLower.includes('agricol') || 
                          titleLower.includes('arabil') || titleLower.includes('fâneață') || 
                          titleLower.includes('faneata') || titleLower.includes('pășune') || 
                          titleLower.includes('pasune');
    
    if (isAgricultural) {
      // Terenuri Agricole
      // Query: "teren agricol {suprafata} ha {localitate} {judet} de vanzare arabil"
      parts.push("teren agricol");
      
      // Suprafață (ha)
      if (attributes?.surface || attributes?.suprafata || attributes?.ha || attributes?.hectare) {
        const surface = attributes.surface || attributes.suprafata || attributes.ha || attributes.hectare;
        parts.push(`${surface} ha`);
      }
      
      // Localitate / județ
      if (city) parts.push(city);
      if (attributes?.county || attributes?.judet) {
        parts.push(attributes.county || attributes.judet);
      }
      
      // Categoria (arabil, fâneață, pășune)
      if (attributes?.category || attributes?.categorie || attributes?.tip_categorie) {
        parts.push(attributes.category || attributes.categorie || attributes.tip_categorie);
      } else {
        // Detectare automată din titlu
        if (titleLower.includes('arabil')) parts.push("arabil");
        else if (titleLower.includes('fâneață') || titleLower.includes('faneata')) parts.push("fâneață");
        else if (titleLower.includes('pășune') || titleLower.includes('pasune')) parts.push("pășune");
      }
      
      // Calitatea solului (bonitatea)
      if (attributes?.soil_quality || attributes?.calitate_sol || attributes?.bonitate) {
        parts.push(`bonitate ${attributes.soil_quality || attributes.calitate_sol || attributes.bonitate}`);
      }
      
      // Acces drum
      if (attributes?.road_access || attributes?.acces_drum) {
        parts.push(attributes.road_access || attributes.acces_drum ? "cu acces drum" : "fără acces drum");
      }
      
      // Irigații
      if (attributes?.irrigation || attributes?.irigatii) {
        parts.push(attributes.irrigation || attributes.irigatii ? "cu irigații" : "fără irigații");
      }
      
      parts.push("de vanzare", "România");
    } else {
      // Terenuri Intravilane
      // Query: "teren intravilan {suprafata} mp {zona} {oras} de vanzare"
      parts.push("teren intravilan");
      
      // 1. Oraș / comună
    if (city) parts.push(city);
    if (area) parts.push(area);
      
      // 2. Zonă
      if (attributes?.zone || attributes?.zona || attributes?.cartier) {
        parts.push(attributes.zone || attributes.zona || attributes.cartier);
      }
      
      // 3. Suprafață (mp)
      if (attributes?.surface || attributes?.suprafata || attributes?.mp) {
        parts.push(`${attributes.surface || attributes.suprafata || attributes.mp} mp`);
      }
      
      // 4. Front stradal (metri)
      if (attributes?.front || attributes?.front_stradal || attributes?.deschidere) {
        parts.push(`front ${attributes.front || attributes.front_stradal || attributes.deschidere} m`);
      }
      
      // 5. Utilități (gaz, curent, apă, canalizare)
      if (attributes?.utilities || attributes?.utilitati) {
        const utilities = attributes.utilities || attributes.utilitati;
        if (typeof utilities === 'string') {
          parts.push(utilities);
        } else if (Array.isArray(utilities)) {
          parts.push(utilities.join(" "));
        }
      }
      
      // 6. Tip teren (construcții, duplex, industrial)
      if (attributes?.type || attributes?.tip || attributes?.tip_teren) {
        parts.push(attributes.type || attributes.tip || attributes.tip_teren);
      }
      
      // 7. POT / CUT
      if (attributes?.pot || attributes?.cut || attributes?.pud || attributes?.pug) {
        parts.push(attributes.pot || attributes.cut || attributes.pud || attributes.pug);
      }
      
      // 8. Intravilan vs extravilan (must!)
      if (attributes?.intravilan === true || attributes?.intravilan === 'true') {
        parts.push("intravilan");
      } else if (attributes?.extravilan === true || attributes?.extravilan === 'true') {
        parts.push("extravilan");
      }
      
      parts.push("de vanzare", "România");
    }
  } else if (category === "commercial" || category === "spatiu_comercial" || category === "birouri") {
    // Spații Comerciale
    // Query: "spatiu comercial {suprafata} mp {zona} {oras} de vanzare stradal"
    parts.push("spatiu comercial");
    
    // Suprafață utilă (±15% pentru filtrare)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_utila) {
      parts.push(`${attributes.surface || attributes.suprafata || attributes.suprafata_utila} mp`);
    }
    
    // Zonă (central, ultracentral, piață, mall, bulevard) - CRITIC pentru filtrare
    if (area) parts.push(area);
    if (attributes?.zone || attributes?.zona || attributes?.location_type || attributes?.tip_zona) {
      const zone = attributes.zone || attributes.zona || attributes.location_type || attributes.tip_zona;
      parts.push(zone);
      // Detectare automată tip zonă
      const zoneLower = String(zone).toLowerCase();
      if (zoneLower.includes('central') || zoneLower.includes('centru')) {
        parts.push("central");
      } else if (zoneLower.includes('mall') || zoneLower.includes('centru comercial')) {
        parts.push("mall");
      } else if (zoneLower.includes('bulevard') || zoneLower.includes('bd')) {
        parts.push("bulevard");
      } else if (zoneLower.includes('piață') || zoneLower.includes('piata')) {
        parts.push("piata");
      }
    }
    
    // Oraș
    if (city) parts.push(city);
    
    // Tip spațiu (stradal / mall / etaj 1 / birouri) - similar pentru filtrare
    if (attributes?.type || attributes?.tip || attributes?.tip_spatiu) {
      const type = attributes.type || attributes.tip || attributes.tip_spatiu;
      parts.push(type);
      // Detectare automată
      const typeLower = String(type).toLowerCase();
      if (typeLower.includes('stradal') || typeLower.includes('strada')) {
        parts.push("stradal");
      } else if (typeLower.includes('mall')) {
        parts.push("mall");
      } else if (typeLower.includes('birouri') || typeLower.includes('birou')) {
        parts.push("birouri");
      } else if (typeLower.includes('etaj')) {
        parts.push("etaj 1");
      }
    }
    
    // Vitrină (da / nu, lungime)
    if (attributes?.showcase || attributes?.vitrine) {
      const hasShowcase = attributes.showcase || attributes.vitrine;
      if (hasShowcase) {
        parts.push("cu vitrine");
        if (attributes?.showcase_length || attributes?.lungime_vitrina) {
          parts.push(`${attributes.showcase_length || attributes.lungime_vitrina} m vitrina`);
        }
      } else {
        parts.push("fara vitrine");
      }
    }
    
    // Trafic pietonal
    if (attributes?.traffic || attributes?.trafic || attributes?.trafic_pietonal) {
      parts.push(`trafic ${attributes.traffic || attributes.trafic || attributes.trafic_pietonal}`);
    }
    
    // An construcție clădire
    if (attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_cladire) {
      parts.push(`an ${attributes.year || attributes.an || attributes.anConstructie || attributes.an_cladire}`);
    }
    
    // Stare (renovat / nerenovat)
    if (attributes?.condition || attributes?.stare || attributes?.state) {
      parts.push(attributes.condition || attributes.stare || attributes.state);
    }
    if (attributes?.renovated || attributes?.renovat) {
      parts.push(attributes.renovated || attributes.renovat ? "renovat" : "nerenovat");
    }
    
    parts.push("de vanzare", "România");
  } else if (category === "industrial" || category === "hala" || category === "hala_industriala") {
    parts.push("hală industrială de vânzare", "preț");
    
    // 1. Zonă industrială / logistică
    if (city) parts.push(city);
    if (area) parts.push(area);
    if (attributes?.zone || attributes?.zona_industriala) {
      parts.push(attributes.zone || attributes.zona_industriala);
    }
    
    // 2. Suprafață hală (mp)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_hala) {
      parts.push(`hală ${attributes.surface || attributes.suprafata || attributes.suprafata_hala} mp`);
    }
    
    // 3. Suprafață teren
    if (attributes?.land || attributes?.teren || attributes?.suprafata_teren) {
      parts.push(`teren ${attributes.land || attributes.teren || attributes.suprafata_teren} mp`);
    }
    
    // 4. Înălțime utilă
    if (attributes?.height || attributes?.inaltime || attributes?.inaltime_utila) {
      parts.push(`înălțime ${attributes.height || attributes.inaltime || attributes.inaltime_utila} m`);
    }
    
    // 5. Acces TIR, rampă
    if (attributes?.tir_access || attributes?.acces_tir || attributes?.rampa) {
      parts.push(attributes.tir_access || attributes.acces_tir || attributes.rampa ? "cu acces TIR" : "fără acces TIR");
    }
    
    // 6. Tip construcție
    if (attributes?.construction || attributes?.constructie || attributes?.tip_constructie) {
      parts.push(attributes.construction || attributes.constructie || attributes.tip_constructie);
    }
    
    parts.push("România");
  } else if (category === "construction_equipment" || category === "utilaje_construcții" || category === "utilaje") {
    // Utilaje Construcții: mini-excavator, buldoexcavator, încărcător frontal
    // Format: "mini excavator Caterpillar 301.7 2017 ore 2500 de vanzare"
    
    // Tip utilaj
    if (attributes?.type || attributes?.tip) {
      parts.push(attributes.type || attributes.tip);
    } else {
      // Extrage din titlu
      const titleLower = title.toLowerCase();
      if (titleLower.includes('mini excavator') || titleLower.includes('mini-excavator')) {
        parts.push("mini excavator");
      } else if (titleLower.includes('buldoexcavator') || titleLower.includes('bulldozer')) {
        parts.push("buldoexcavator");
      } else if (titleLower.includes('încărcător') || titleLower.includes('incarcator') || titleLower.includes('loader')) {
        parts.push("încărcător frontal");
      } else {
        parts.push(title.split(" ").slice(0, 2).join(" "));
      }
    }
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      parts.push(attributes.brand || attributes.marca);
    }
    
    // Model
    if (attributes?.model) {
      parts.push(attributes.model);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      parts.push(attributes.year || attributes.an);
    }
    
    // Ore de funcționare (IMPORTANT!)
    if (attributes?.hours || attributes?.ore || attributes?.ore_funcionare) {
      parts.push(`ore ${attributes.hours || attributes.ore || attributes.ore_funcionare}`);
    }
    
    // Tip motor / putere
    if (attributes?.engine || attributes?.motor || attributes?.power || attributes?.putere) {
      parts.push(attributes.engine || attributes.motor || attributes.power || attributes.putere);
    }
    
    parts.push("de vanzare", "România");
  } else if (category === "agricultural_equipment" || category === "utilaje_agricole") {
    // Utilaje Agricole: tractor, combină, plug, semănătoare
    // Format: "tractor John Deere 5100 2015 100CP ore 3500 de vanzare"
    
    // Tip utilaj
    if (attributes?.type || attributes?.tip) {
      parts.push(attributes.type || attributes.tip);
    } else {
      const titleLower = title.toLowerCase();
      if (titleLower.includes('tractor')) parts.push("tractor");
      else if (titleLower.includes('combină') || titleLower.includes('combina')) parts.push("combină");
      else if (titleLower.includes('plug')) parts.push("plug");
      else if (titleLower.includes('semănătoare') || titleLower.includes('semanatoare')) parts.push("semănătoare");
      else parts.push(title.split(" ")[0]);
    }
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      parts.push(attributes.brand || attributes.marca);
    }
    
    // Model
    if (attributes?.model) {
      parts.push(attributes.model);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      parts.push(attributes.year || attributes.an);
    }
    
    // HP (putere motor)
    if (attributes?.hp || attributes?.power || attributes?.putere || attributes?.cp) {
      parts.push(`${attributes.hp || attributes.power || attributes.putere || attributes.cp}CP`);
    }
    
    // Ore de funcționare
    if (attributes?.hours || attributes?.ore || attributes?.ore_funcionare) {
      parts.push(`ore ${attributes.hours || attributes.ore || attributes.ore_funcionare}`);
    }
    
    parts.push("de vanzare", "România");
  } else if (category === "forestry_equipment" || category === "echipamente_forestiere") {
    // Echipamente Forestiere: TAF, forwarder, harvester
    parts.push(title.split(" ").slice(0, 3).join(" "));
    
    if (attributes?.brand || attributes?.marca) parts.push(attributes.brand || attributes.marca);
    if (attributes?.model) parts.push(attributes.model);
    if (attributes?.capacity || attributes?.capacitate || attributes?.power || attributes?.putere) {
      parts.push(attributes.capacity || attributes.capacitate || attributes.power || attributes.putere);
    }
    if (attributes?.hours || attributes?.ore) parts.push(`ore ${attributes.hours || attributes.ore}`);
    if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
    
    parts.push("de vanzare", "România");
  } else if (category === "generators" || category === "compressors" || category === "generatoare" || category === "compresoare") {
    // Generatoare & Compresoare
    if (attributes?.type || attributes?.tip) {
      parts.push(attributes.type || attributes.tip);
    } else {
      parts.push(title.split(" ").slice(0, 2).join(" "));
    }
    
    if (attributes?.power || attributes?.putere || attributes?.kva) {
      parts.push(`${attributes.power || attributes.putere || attributes.kva} kVA`);
    }
    if (attributes?.hours || attributes?.ore) parts.push(`ore ${attributes.hours || attributes.ore}`);
    if (attributes?.brand || attributes?.marca) parts.push(attributes.brand || attributes.marca);
    if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
    if (attributes?.noise || attributes?.zgomot) parts.push(attributes.noise || attributes.zgomot);
    
    parts.push("de vanzare", "România");
  } else if (category === "professional_tools" || category === "scule_profesionale") {
    // Scule Profesionale
    if (attributes?.brand || attributes?.marca) {
      parts.push(attributes.brand || attributes.marca);
    }
    if (attributes?.model) parts.push(attributes.model);
    if (attributes?.power || attributes?.putere || attributes?.watt) {
      parts.push(`${attributes.power || attributes.putere || attributes.watt}W`);
    }
    if (attributes?.condition || attributes?.stare) {
      parts.push(attributes.condition || attributes.stare);
    }
    
    parts.push("scule profesionale", "de vanzare", "România");
  } else if (category === "auto_workshop" || category === "echipamente_atelier_auto") {
    // Echipamente Ateliere Auto
    if (attributes?.type || attributes?.tip) {
      parts.push(attributes.type || attributes.tip);
    }
    if (attributes?.tonnage || attributes?.tonaj) {
      parts.push(`${attributes.tonnage || attributes.tonaj}T`);
    }
    if (attributes?.brand || attributes?.marca) parts.push(attributes.brand || attributes.marca);
    if (attributes?.year || attributes?.an) parts.push(attributes.year || attributes.an);
    
    parts.push("echipament atelier auto", "de vanzare", "România");
  } else if (category === "art" || category === "arta" || category === "antichitati" || category === "arte") {
    // Detectează subcategoria pentru artă
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('pictură') || titleLower.includes('pictura') || 
          titleLower.includes('tablou') || titleLower.includes('panza') || 
          titleLower.includes('ulei') || titleLower.includes('acrilic') || 
          titleLower.includes('acuarelă') || titleLower.includes('acuarela')) {
        detectedSubcategory = "picturi";
      } else if (titleLower.includes('sculptură') || titleLower.includes('sculptura') || 
                 titleLower.includes('bronz') || titleLower.includes('marmură') || 
                 titleLower.includes('marmura') || titleLower.includes('lemn sculptat')) {
        detectedSubcategory = "sculpturi";
      } else if (titleLower.includes('bijuterie') || titleLower.includes('ceas') || 
                 titleLower.includes('rolex') || titleLower.includes('cartier') || 
                 titleLower.includes('patek') || titleLower.includes('aur') || 
                 titleLower.includes('platină') || titleLower.includes('platina')) {
        detectedSubcategory = "bijuterii";
      } else if (titleLower.includes('colecție') || titleLower.includes('colectie') || 
                 titleLower.includes('monedă') || titleLower.includes('moneda') || 
                 titleLower.includes('medalie') || titleLower.includes('filatelie') || 
                 titleLower.includes('artefact')) {
        detectedSubcategory = "colectii";
      } else if (titleLower.includes('mobilier') || titleLower.includes('epocă') || 
                 titleLower.includes('epoca') || titleLower.includes('art deco') || 
                 titleLower.includes('victorian')) {
        detectedSubcategory = "mobilier";
      } else if (titleLower.includes('carte') || titleLower.includes('hărți') || 
                 titleLower.includes('harti') || titleLower.includes('ediție') || 
                 titleLower.includes('editie')) {
        detectedSubcategory = "carti";
      } else if (titleLower.includes('fotografie') || titleLower.includes('foto artistică') || 
                 titleLower.includes('print limitat') || titleLower.includes('fine art')) {
        detectedSubcategory = "fotografie";
      } else if (titleLower.includes('caritabil') || titleLower.includes('donatie') || 
                 titleLower.includes('licitație caritabilă') || titleLower.includes('licitatie caritabila')) {
        detectedSubcategory = "caritabile";
      } else {
        detectedSubcategory = "picturi"; // Default
      }
    }
    
    if (detectedSubcategory === "picturi") {
      // Picturi
      // Query: "tablou {artist} {titlu} {tehnica} {dimensiuni} de vanzare"
      parts.push("tablou");
      
      // Numele artistului (esențial!)
      if (attributes?.artist || attributes?.artist_name || attributes?.pictor) {
        parts.push(attributes.artist || attributes.artist_name || attributes.pictor);
      } else {
        // Încearcă să extragă din titlu (primul cuvânt sau primele două)
        const titleWords = title.split(" ");
        if (titleWords.length >= 2) {
          parts.push(titleWords[0], titleWords[1]);
        } else if (titleWords.length >= 1) {
          parts.push(titleWords[0]);
        }
      }
      
      // Titlul lucrării
      if (attributes?.title || attributes?.titlu || attributes?.work_title) {
        parts.push(attributes.title || attributes.titlu || attributes.work_title);
      }
      
      // Tehnica (ulei pe pânză, acrilic, acuarelă etc.)
      if (attributes?.technique || attributes?.tehnica || attributes?.technique_type) {
        parts.push(attributes.technique || attributes.tehnica || attributes.technique_type);
      }
      
      // Dimensiuni (cm)
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
      } else if (attributes?.width || attributes?.height || attributes?.latime || attributes?.inaltime) {
        const width = attributes.width || attributes.latime;
        const height = attributes.height || attributes.inaltime;
        if (width && height) {
          parts.push(`${width}x${height}cm`);
        }
      }
      
      // Anul realizării
      if (attributes?.year || attributes?.an || attributes?.year_created) {
        parts.push(attributes.year || attributes.an || attributes.year_created);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "sculpturi") {
      // Sculpturi
      // Query: "sculptura {artist} {material} {dimensiuni} de vanzare"
      parts.push("sculptura");
      
      // Artist
      if (attributes?.artist || attributes?.artist_name || attributes?.sculptor) {
        parts.push(attributes.artist || attributes.artist_name || attributes.sculptor);
      }
      
      // Material (bronze, lemn, marmură, ghips etc.)
      if (attributes?.material || attributes?.material_type) {
        parts.push(attributes.material || attributes.material_type);
      }
      
      // Dimensiuni
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
      } else if (attributes?.height || attributes?.inaltime) {
        parts.push(`${attributes.height || attributes.inaltime}cm`);
      }
      
      // Greutate (opțional)
      if (attributes?.weight || attributes?.greutate) {
        parts.push(`${attributes.weight || attributes.greutate}kg`);
      }
      
      // Anul
      if (attributes?.year || attributes?.an || attributes?.year_created) {
        parts.push(attributes.year || attributes.an || attributes.year_created);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "bijuterii") {
      // Bijuterii și Ceasuri
      // Query: "{brand} {model} {material} {carataj} de vanzare"
      // Brand (Cartier, Rolex, Patek etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Material (aur 14K/18K, platină)
      if (attributes?.material || attributes?.material_type || attributes?.metal) {
        parts.push(attributes.material || attributes.material_type || attributes.metal);
      }
      
      // Carataj pietre prețioase
      if (attributes?.carat || attributes?.carataj || attributes?.carats) {
        parts.push(`${attributes.carat || attributes.carataj || attributes.carats}ct`);
      }
      
      // Greutate aur
      if (attributes?.gold_weight || attributes?.greutate_aur || attributes?.weight) {
        parts.push(`${attributes.gold_weight || attributes.greutate_aur || attributes.weight}g`);
      }
      
      // An producție
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "colectii") {
      // Obiecte de Colecție
      // Query: "{tip} {an} {raritate} de vanzare"
      // Tip de colecție (monede, medalii, filatelie, artefacte)
      if (attributes?.type || attributes?.tip || attributes?.collection_type) {
        parts.push(attributes.type || attributes.tip || attributes.collection_type);
      } else {
        // Detectare automată
        if (titleLower.includes('monedă') || titleLower.includes('moneda')) parts.push("moneda");
        else if (titleLower.includes('medalie')) parts.push("medalie");
        else if (titleLower.includes('filatelie') || titleLower.includes('timbru')) parts.push("filatelie");
        else if (titleLower.includes('artefact')) parts.push("artefact");
      }
      
      // Anul
      if (attributes?.year || attributes?.an) {
        parts.push(attributes.year || attributes.an);
      }
      
      // Raritate
      if (attributes?.rarity || attributes?.raritate || attributes?.rare) {
        parts.push(attributes.rarity || attributes.raritate || attributes.rare);
      }
      
      // Material (argint, aur etc.)
      if (attributes?.material || attributes?.material_type) {
        parts.push(attributes.material || attributes.material_type);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "mobilier") {
      // Mobilier de Epocă
      // Query: "mobilier epoca {stil} {material} {an} de vanzare"
      parts.push("mobilier epoca");
      
      // Perioada (Art Deco, Victorian, Sec. XIX etc.)
      if (attributes?.period || attributes?.perioada || attributes?.style || attributes?.stil) {
        parts.push(attributes.period || attributes.perioada || attributes.style || attributes.stil);
      }
      
      // Material (lemn masiv, mahon, nuc)
      if (attributes?.material || attributes?.material_type || attributes?.wood) {
        parts.push(attributes.material || attributes.material_type || attributes.wood);
      }
      
      // Anul
      if (attributes?.year || attributes?.an || attributes?.year_made) {
        parts.push(attributes.year || attributes.an || attributes.year_made);
      }
      
      // Dimensiuni
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "carti") {
      // Cărți Rare & Hărți Vechi
      // Query: "carte rara {autor} {titlu} {an} editie de vanzare"
      parts.push("carte rara");
      
      // Autor
      if (attributes?.author || attributes?.autor) {
        parts.push(attributes.author || attributes.autor);
      }
      
      // Titlu
      if (attributes?.title || attributes?.titlu || attributes?.book_title) {
        parts.push(attributes.title || attributes.titlu || attributes.book_title);
      }
      
      // Anul tipăririi
      if (attributes?.year || attributes?.an || attributes?.year_published) {
        parts.push(attributes.year || attributes.an || attributes.year_published);
      }
      
      // Ediția
      if (attributes?.edition || attributes?.editie || attributes?.ed) {
        parts.push(`editie ${attributes.edition || attributes.editie || attributes.ed}`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "fotografie") {
      // Fotografie Artistică
      // Query: "fotografie artistica {artist} print limitat {dimensiuni} de vanzare"
      parts.push("fotografie artistica");
      
      // Artist fotograf
      if (attributes?.artist || attributes?.artist_name || attributes?.photographer) {
        parts.push(attributes.artist || attributes.artist_name || attributes.photographer);
      }
      
      // Tip fotografie (fine art, analog, digital)
      if (attributes?.type || attributes?.tip || attributes?.photo_type) {
        parts.push(attributes.type || attributes.tip || attributes.photo_type);
      }
      
      // Print limitat (1/100, 2/10 etc.)
      if (attributes?.limited_edition || attributes?.print_limitat || attributes?.edition) {
        parts.push(`print limitat ${attributes.limited_edition || attributes.print_limitat || attributes.edition}`);
      }
      
      // Dimensiuni
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
      }
      
      // Anul
      if (attributes?.year || attributes?.an || attributes?.year_created) {
        parts.push(attributes.year || attributes.an || attributes.year_created);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "caritabile") {
      // Licitații Caritabile
      // Query: "{obiect} donatie licitatie caritabila de vanzare"
      parts.push(title.split(" ").slice(0, 3).join(" "));
      parts.push("donatie", "licitatie caritabila", "de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "electronics" || category === "electronice" || category === "tehnologie") {
    // Detectează subcategoria pentru electronice
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('laptop') || titleLower.includes('notebook') || 
          titleLower.includes('macbook') || titleLower.includes('pc') || 
          titleLower.includes('computer') || titleLower.includes('thinkpad')) {
        detectedSubcategory = "laptop";
      } else if (titleLower.includes('telefon') || titleLower.includes('iphone') || 
                 titleLower.includes('samsung') || titleLower.includes('huawei') || 
                 titleLower.includes('xiaomi') || titleLower.includes('mobile')) {
        detectedSubcategory = "telefon";
      } else if (titleLower.includes('tabletă') || titleLower.includes('tableta') || 
                 titleLower.includes('ipad') || titleLower.includes('tablet')) {
        detectedSubcategory = "tableta";
      } else if (titleLower.includes('tv') || titleLower.includes('televizor') || 
                 titleLower.includes('audio') || titleLower.includes('soundbar') || 
                 titleLower.includes('boxe')) {
        detectedSubcategory = "tv_audio";
      } else if (titleLower.includes('console') || titleLower.includes('ps5') || 
                 titleLower.includes('xbox') || titleLower.includes('nintendo') || 
                 titleLower.includes('playstation')) {
        detectedSubcategory = "console";
      } else if (titleLower.includes('drone') || titleLower.includes('dji') || 
                 titleLower.includes('smart') || titleLower.includes('gadget')) {
        detectedSubcategory = "drone";
      } else if (titleLower.includes('cameră') || titleLower.includes('camera') || 
                 titleLower.includes('canon') || titleLower.includes('sony') || 
                 titleLower.includes('nikon') || titleLower.includes('foto') || 
                 titleLower.includes('video')) {
        detectedSubcategory = "foto_video";
      } else {
        detectedSubcategory = "laptop";
      }
    }
    
    if (detectedSubcategory === "laptop" || detectedSubcategory === "pc") {
      // Laptopuri & PC-uri
      // Query: "{brand} {model} {procesor} {ram} {ssd} de vanzare"
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Procesor
      if (attributes?.processor || attributes?.procesor || attributes?.cpu) {
        parts.push(attributes.processor || attributes.procesor || attributes.cpu);
      }
      
      // Memorie RAM
      if (attributes?.ram || attributes?.memory || attributes?.memorie) {
        parts.push(`${attributes.ram || attributes.memory || attributes.memorie}GB`);
      }
      
      // Stocare (SSD/HDD, capacitate)
      if (attributes?.storage || attributes?.stocare || attributes?.ssd || attributes?.hdd) {
        const storage = attributes.storage || attributes.stocare || attributes.ssd || attributes.hdd;
        const storageType = attributes?.storage_type || attributes?.tip_stocare || 
                           (attributes?.ssd ? "SSD" : attributes?.hdd ? "HDD" : null);
        if (storageType) {
          parts.push(`${storage}${storageType}`);
        } else {
          parts.push(`${storage}GB`);
        }
      }
      
      // An producție
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "telefon") {
      // Telefoane Mobile
      // Query: "{brand} {model} {capacitate} de vanzare Romania"
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Capacitate stocare
      if (attributes?.storage || attributes?.stocare || attributes?.capacitate) {
        parts.push(`${attributes.storage || attributes.stocare || attributes.capacitate}GB`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "tableta") {
      // Tablete
      // Query: "iPad Pro 2020 256GB WiFi de vanzare"
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // An producție
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Stocare
      if (attributes?.storage || attributes?.stocare || attributes?.capacitate) {
        parts.push(`${attributes.storage || attributes.stocare || attributes.capacitate}GB`);
      }
      
      // Conectivitate (Wi-Fi / LTE)
      if (attributes?.connectivity || attributes?.conectivitate || attributes?.wifi || attributes?.lte) {
        const connectivity = attributes.connectivity || attributes.conectivitate || 
                            (attributes.wifi ? "WiFi" : attributes.lte ? "LTE" : null);
        if (connectivity) parts.push(connectivity);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "tv_audio") {
      // TV & Audio
      // Query: "OLED LG C1 55 inch de vanzare Romania"
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Tip display (LED / QLED / OLED / MiniLED)
      if (attributes?.display_type || attributes?.tip_display || attributes?.screen_type) {
        parts.push(attributes.display_type || attributes.tip_display || attributes.screen_type);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Diagonală (cm / inch)
      if (attributes?.diagonal || attributes?.diagonala || attributes?.size || attributes?.marime) {
        parts.push(`${attributes.diagonal || attributes.diagonala || attributes.size || attributes.marime} inch`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "console") {
      // Console & Jocuri
      // Query: "PS5 Disc 825GB de vanzare"
      // Brand (Sony / Microsoft / Nintendo)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model (PS5 Disc / PS5 Digital / Xbox Series X)
      if (attributes?.model || attributes?.model_name || attributes?.console_type) {
        parts.push(attributes.model || attributes.model_name || attributes.console_type);
      }
      
      // Capacitate stocare
      if (attributes?.storage || attributes?.stocare || attributes?.capacitate) {
        parts.push(`${attributes.storage || attributes.stocare || attributes.capacitate}GB`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "drone") {
      // Drone & Gadgeturi Smart
      // Query: "drone DJI Mini 3 Pro fly more combo de vanzare"
      parts.push("drone");
      
      // Brand (DJI etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Fly More Combo
      if (attributes?.fly_more_combo || attributes?.combo) {
        parts.push("fly more combo");
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "foto_video") {
      // Echipamente Foto/Video
      // Query: "Sony A7 III 24-70mm shutter count 25000 de vanzare"
      // Brand (Canon / Sony / Nikon)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Obiective incluse
      if (attributes?.lens || attributes?.obiectiv || attributes?.objective) {
        parts.push(attributes.lens || attributes.obiectiv || attributes.objective);
      }
      
      // Shutter count
      if (attributes?.shutter_count || attributes?.numar_declansari || attributes?.shutter) {
        parts.push(`shutter count ${attributes.shutter_count || attributes.numar_declansari || attributes.shutter}`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "fashion" || category === "moda" || category === "lifestyle" || category === "moda_lifestyle") {
    // Detectează subcategoria pentru modă & lifestyle
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('haină') || titleLower.includes('haina') || 
          titleLower.includes('hoodie') || titleLower.includes('tricou') || 
          titleLower.includes('jachetă') || titleLower.includes('jaceta') || 
          titleLower.includes('pantaloni') || titleLower.includes('rochie') || 
          titleLower.includes('designer') || titleLower.includes('gucci') || 
          titleLower.includes('balenciaga') || titleLower.includes('burberry')) {
        detectedSubcategory = "haine";
      } else if (titleLower.includes('încălțăminte') || titleLower.includes('incaltaminte') || 
                 titleLower.includes('sneaker') || titleLower.includes('pantof') || 
                 titleLower.includes('adidasi') || titleLower.includes('nike') || 
                 titleLower.includes('adidas') || titleLower.includes('jordan') || 
                 titleLower.includes('yeezy') || titleLower.includes('boots')) {
        detectedSubcategory = "incaltaminte";
      } else if (titleLower.includes('geantă') || titleLower.includes('geanta') || 
                 titleLower.includes('bag') || titleLower.includes('rucsac') || 
                 titleLower.includes('portofel') || titleLower.includes('curea') || 
                 titleLower.includes('louis vuitton') || titleLower.includes('gucci') || 
                 titleLower.includes('prada') || titleLower.includes('dior')) {
        detectedSubcategory = "genti";
      } else if (titleLower.includes('parfum') || titleLower.includes('perfume') || 
                 titleLower.includes('cosmetic') || titleLower.includes('makeup') || 
                 titleLower.includes('tester')) {
        detectedSubcategory = "parfumuri";
      } else if (titleLower.includes('ceas') || titleLower.includes('watch') || 
                 titleLower.includes('rolex') || titleLower.includes('omega') || 
                 titleLower.includes('tag heuer') || titleLower.includes('lux')) {
        detectedSubcategory = "ceasuri";
      } else {
        detectedSubcategory = "haine";
      }
    }
    
    if (detectedSubcategory === "haine") {
      // Haine de Designer
      // Query: "{brand} {model} {material_optional} {marime} de vanzare second hand"
      // Brand (Gucci, Balenciaga, Burberry etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model / Colecție / Linie
      if (attributes?.model || attributes?.model_name || attributes?.collection || attributes?.colectie) {
        parts.push(attributes.model || attributes.model_name || attributes.collection || attributes.colectie);
      }
      
      // Material (opțional)
      if (attributes?.material || attributes?.material_type) {
        parts.push(attributes.material || attributes.material_type);
      }
      
      // Mărime
      if (attributes?.size || attributes?.marime || attributes?.size_eu) {
        parts.push(`mărime ${attributes.size || attributes.marime || attributes.size_eu}`);
      }
      
      parts.push("de vanzare", "second hand", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "incaltaminte") {
      // Încălțăminte
      // Query: "{brand} {model} {marime} {condition} de vanzare Romania"
      // Brand (Nike, Adidas, Louboutin, Gucci etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model (Air Jordan 1, Yeezy 350 etc.)
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Mărime
      if (attributes?.size || attributes?.marime || attributes?.size_eu) {
        parts.push(`mărime ${attributes.size || attributes.marime || attributes.size_eu}`);
      }
      
      // Condiție (DS – deadstock, VNDS, folosiți)
      if (attributes?.condition || attributes?.stare || attributes?.conditie) {
        const condition = attributes.condition || attributes.stare || attributes.conditie;
        parts.push(condition);
        // Detectare automată condiție
        const conditionLower = String(condition).toLowerCase();
        if (conditionLower.includes('deadstock') || conditionLower.includes('ds') || conditionLower.includes('nou')) {
          parts.push("deadstock");
        } else if (conditionLower.includes('vnds') || conditionLower.includes('ca nou')) {
          parts.push("VNDS");
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "genti") {
      // Genți & Accesorii
      // Query: "geanta {brand} {model} {material} de vanzare"
      parts.push("geanta");
      
      // Brand (Louis Vuitton, Gucci, Prada, Dior etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model exact (Neverfull MM, Speedy, Marmont etc.)
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Material (piele, canvas)
      if (attributes?.material || attributes?.material_type) {
        parts.push(attributes.material || attributes.material_type);
      }
      
      // Culoare (opțional)
      if (attributes?.color || attributes?.culoare) {
        parts.push(attributes.color || attributes.culoare);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "parfumuri") {
      // Parfumuri & Cosmetice
      // Query: "parfum {brand} {model} {ml} de vanzare Romania"
      parts.push("parfum");
      
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model parfum
      if (attributes?.model || attributes?.model_name || attributes?.perfume_name) {
        parts.push(attributes.model || attributes.model_name || attributes.perfume_name);
      }
      
      // Cantitate (ml) (identică pentru filtrare)
      if (attributes?.capacity || attributes?.capacitate || attributes?.ml || attributes?.volume) {
        parts.push(`${attributes.capacity || attributes.capacitate || attributes.ml || attributes.volume}ml`);
      }
      
      // Stare (sigilat / folosit)
      if (attributes?.condition || attributes?.stare || attributes?.sealed) {
        const condition = attributes.condition || attributes.stare;
        if (condition && String(condition).toLowerCase().includes('sigilat')) {
          parts.push("sigilat");
        } else if (attributes.sealed) {
          parts.push("sigilat");
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "ceasuri") {
      // Ceasuri de Lux
      // Query: "{brand} {model} {reference} {material} de vanzare"
      // Brand (Rolex, Omega, TAG Heuer etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      } else {
        const brandFromTitle = title.split(" ")[0];
        if (brandFromTitle) parts.push(brandFromTitle);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Referință (VERY IMPORTANT)
      if (attributes?.reference || attributes?.referinta || attributes?.ref || attributes?.model_reference) {
        parts.push(attributes.reference || attributes.referinta || attributes.ref || attributes.model_reference);
      }
      
      // Material (steel, two-tone, gold)
      if (attributes?.material || attributes?.material_type || attributes?.case_material) {
        parts.push(attributes.material || attributes.material_type || attributes.case_material);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "agriculture" || category === "agricultura" || category === "zootehnie" || 
             category === "agricultura_zootehnie" || category === "agro") {
    // Detectează subcategoria pentru agricultură & zootehnie
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('tractor') || titleLower.includes('combină') || titleLower.includes('combina') || 
          titleLower.includes('combine') || titleLower.includes('john deere') || titleLower.includes('claas') || 
          titleLower.includes('new holland') || titleLower.includes('massey ferguson')) {
        detectedSubcategory = "tractoare";
      } else if (titleLower.includes('remorcă agricolă') || titleLower.includes('remorca agricola') || 
                 titleLower.includes('remorca') || titleLower.includes('basculabilă') || 
                 titleLower.includes('basculabila') || titleLower.includes('tandem')) {
        detectedSubcategory = "remorci";
      } else if (titleLower.includes('irigații') || titleLower.includes('irigatii') || 
                 titleLower.includes('irrigation') || titleLower.includes('motopompă') || 
                 titleLower.includes('motopompa') || titleLower.includes('tambur') || 
                 titleLower.includes('furtun') || titleLower.includes('pivot')) {
        detectedSubcategory = "irigatii";
      } else if (titleLower.includes('vaca') || titleLower.includes('bovin') || 
                 titleLower.includes('oi') || titleLower.includes('ovin') || 
                 titleLower.includes('capră') || titleLower.includes('capra') || 
                 titleLower.includes('caprin') || titleLower.includes('pasăre') || 
                 titleLower.includes('pasare') || titleLower.includes('porc') || 
                 titleLower.includes('porcin') || titleLower.includes('cal') || 
                 titleLower.includes('animal') || titleLower.includes('livestock')) {
        detectedSubcategory = "animale";
      } else if (titleLower.includes('semințe') || titleLower.includes('seminte') || 
                 titleLower.includes('seeds') || titleLower.includes('furaj') || 
                 titleLower.includes('feed') || titleLower.includes('îngrășământ') || 
                 titleLower.includes('ingrasamant') || titleLower.includes('fertilizer') || 
                 titleLower.includes('nutreț') || titleLower.includes('nutret')) {
        detectedSubcategory = "seminte";
      } else {
        detectedSubcategory = "tractoare";
      }
    }
    
    if (detectedSubcategory === "tractoare") {
      // Tractoare, Combine
      // Query: "{tip} {brand} {model} {an} {ore} de vanzare Romania"
      // Tip (tractor, combină etc.)
      if (attributes?.type || attributes?.tip || attributes?.equipment_type) {
        parts.push(attributes.type || attributes.tip || attributes.equipment_type);
      } else {
        if (titleLower.includes('combină') || titleLower.includes('combina') || titleLower.includes('combine')) {
          parts.push("combina");
        } else {
          parts.push("tractor");
        }
      }
      
      // Brand (John Deere, Claas, New Holland, Massey Ferguson etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Ore funcționare (foarte important!)
      if (attributes?.hours || attributes?.ore || attributes?.ore_funcionare || attributes?.ore_functionare) {
        parts.push(`${attributes.hours || attributes.ore || attributes.ore_funcionare || attributes.ore_functionare} ore`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "remorci") {
      // Remorci Agricole
      // Query: "remorca agricola {brand} {capacitate} tone {an} de vanzare"
      parts.push("remorca agricola");
      
      // Brand (Fliegl, MetalFach etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Capacitate (tone)
      if (attributes?.capacity || attributes?.capacitate || attributes?.tonnage || attributes?.tonaj) {
        parts.push(`${attributes.capacity || attributes.capacitate || attributes.tonnage || attributes.tonaj} tone`);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Tip remorcă (opțional)
      if (attributes?.type || attributes?.tip || attributes?.trailer_type) {
        parts.push(attributes.type || attributes.tip || attributes.trailer_type);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "irigatii") {
      // Echipamente de Irigații
      // Query: "irigatii {tip} {brand} {model} {capacitate} de vanzare Romania"
      parts.push("irigatii");
      
      // Tip echipament
      if (attributes?.type || attributes?.tip || attributes?.equipment_type) {
        parts.push(attributes.type || attributes.tip || attributes.equipment_type);
      } else {
        if (titleLower.includes('tambur')) parts.push("tambur");
        else if (titleLower.includes('motopompă') || titleLower.includes('motopompa')) parts.push("motopompa");
        else if (titleLower.includes('furtun')) parts.push("furtun");
        else if (titleLower.includes('pivot')) parts.push("pivot");
        else if (titleLower.includes('pompă submersibilă') || titleLower.includes('pompa submersibila')) parts.push("pompa submersibila");
      }
      
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Capacitate (debit, presiune) sau dimensiuni
      if (attributes?.capacity || attributes?.capacitate || attributes?.flow_rate || attributes?.debit) {
        parts.push(`${attributes.capacity || attributes.capacitate || attributes.flow_rate || attributes.debit}`);
      }
      if (attributes?.diameter || attributes?.diametru || attributes?.diametru_furtun) {
        parts.push(`${attributes.diameter || attributes.diametru || attributes.diametru_furtun}mm`);
      }
      if (attributes?.length || attributes?.lungime || attributes?.lungime_tambur) {
        parts.push(`${attributes.length || attributes.lungime || attributes.lungime_tambur}m`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "animale") {
      // Animale
      // Query: "{tip_animal} rasa {rasa} {varsta} {greutate_optional} de vanzare"
      // Tip animal
      if (attributes?.type || attributes?.tip || attributes?.animal_type) {
        parts.push(attributes.type || attributes.tip || attributes.animal_type);
      } else {
        if (titleLower.includes('vaca') || titleLower.includes('bovin')) parts.push("vaca");
        else if (titleLower.includes('oi') || titleLower.includes('ovin')) parts.push("oi");
        else if (titleLower.includes('capră') || titleLower.includes('capra') || titleLower.includes('caprin')) parts.push("capra");
        else if (titleLower.includes('pasăre') || titleLower.includes('pasare')) parts.push("pasare");
        else if (titleLower.includes('porc') || titleLower.includes('porcin')) parts.push("porc");
        else if (titleLower.includes('cal')) parts.push("cal");
      }
      
      // Rasă
      if (attributes?.breed || attributes?.rasa || attributes?.breed_type) {
        parts.push("rasa", attributes.breed || attributes.rasa || attributes.breed_type);
      }
      
      // Vârstă
      if (attributes?.age || attributes?.varsta || attributes?.age_years) {
        parts.push(`${attributes.age || attributes.varsta || attributes.age_years} ani`);
      }
      
      // Greutate (opțional)
      if (attributes?.weight || attributes?.greutate || attributes?.kg) {
        parts.push(`${attributes.weight || attributes.greutate || attributes.kg}kg`);
      }
      
      // Stare (gestantă, lactație etc.)
      if (attributes?.status || attributes?.stare || attributes?.reproductive_status) {
        parts.push(attributes.status || attributes.stare || attributes.reproductive_status);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "seminte") {
      // Semințe, Furaje, Îngrășăminte
      // Query: "{tip_produs} {brand} {cantitate} de vanzare Romania"
      // Tip produs
      if (attributes?.type || attributes?.tip || attributes?.product_type) {
        parts.push(attributes.type || attributes.tip || attributes.product_type);
      } else {
        if (titleLower.includes('semințe') || titleLower.includes('seminte') || titleLower.includes('seeds')) {
          if (titleLower.includes('porumb')) parts.push("seminte porumb");
          else if (titleLower.includes('floarea-soarelui') || titleLower.includes('floarea soarelui')) parts.push("seminte floarea soarelui");
          else if (titleLower.includes('grâu') || titleLower.includes('grau')) parts.push("seminte grau");
          else parts.push("seminte");
        } else if (titleLower.includes('furaj') || titleLower.includes('feed')) {
          parts.push("furaj");
        } else if (titleLower.includes('îngrășământ') || titleLower.includes('ingrasamant') || titleLower.includes('fertilizer')) {
          parts.push("ingrasamant");
        } else if (titleLower.includes('nutreț') || titleLower.includes('nutret')) {
          parts.push("nutret");
        }
      }
      
      // Brand / producător
      if (attributes?.brand || attributes?.marca || attributes?.producer || attributes?.producator) {
        parts.push(attributes.brand || attributes.marca || attributes.producer || attributes.producator);
      }
      
      // Cantitate / prezentare (sac 25kg / big bag 500kg)
      if (attributes?.quantity || attributes?.cantitate || attributes?.weight || attributes?.greutate) {
        const quantity = attributes.quantity || attributes.cantitate || attributes.weight || attributes.greutate;
        const presentation = attributes?.presentation || attributes?.prezentare || attributes?.package || attributes?.ambalaj;
        if (presentation) {
          parts.push(`${presentation} ${quantity}kg`);
        } else {
          parts.push(`${quantity}kg`);
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "maritime" || category === "aeronautice" || category === "maritime_aeronautice" || 
             category === "boat" || category === "aviation" || category === "yacht" || category === "aircraft") {
    // Detectează subcategoria pentru maritime & aeronautice
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('barcă') || titleLower.includes('barca') || titleLower.includes('iaht') || 
          titleLower.includes('yacht') || titleLower.includes('skijet') || titleLower.includes('jet ski') || 
          titleLower.includes('boat') || titleLower.includes('rib') || titleLower.includes('gonflabil')) {
        detectedSubcategory = "barci";
      } else if (titleLower.includes('motor marin') || titleLower.includes('motor maritim') || 
                 titleLower.includes('outboard') || titleLower.includes('inboard') || 
                 titleLower.includes('motor electric marin')) {
        detectedSubcategory = "motoare";
      } else if (titleLower.includes('avion') || titleLower.includes('aircraft') || 
                 titleLower.includes('ulm') || titleLower.includes('ultraușor') || 
                 titleLower.includes('ultrausor') || titleLower.includes('cessna') || 
                 titleLower.includes('piper') || titleLower.includes('tecnam') || 
                 titleLower.includes('planor') || titleLower.includes('autogiro')) {
        detectedSubcategory = "avioane";
      } else if (titleLower.includes('dronă industrială') || titleLower.includes('drona industriala') || 
                 titleLower.includes('dronă agricolă') || titleLower.includes('drona agricola') || 
                 titleLower.includes('matrice') || titleLower.includes('mavic enterprise') || 
                 titleLower.includes('agras') || titleLower.includes('industrial drone')) {
        detectedSubcategory = "dronuri";
      } else {
        detectedSubcategory = "barci";
      }
    }
    
    if (detectedSubcategory === "barci") {
      // Bărci, Iahturi, Skijeturi
      // Query: "{tip} {brand} {model} {an} {lungime}m {putere}CP de vanzare"
      // Tip barcă
      if (attributes?.type || attributes?.tip || attributes?.boat_type) {
        parts.push(attributes.type || attributes.tip || attributes.boat_type);
      } else {
        if (titleLower.includes('skijet') || titleLower.includes('jet ski')) parts.push("skijet");
        else if (titleLower.includes('iaht') || titleLower.includes('yacht')) parts.push("iaht");
        else if (titleLower.includes('barcă pescuit') || titleLower.includes('barca pescuit') || titleLower.includes('fishing boat')) parts.push("barca pescuit");
        else if (titleLower.includes('cabin cruiser')) parts.push("cabin cruiser");
        else if (titleLower.includes('rib')) parts.push("RIB");
        else if (titleLower.includes('gonflabil')) parts.push("barca gonflabila");
        else parts.push("barca");
      }
      
      // Brand (Yamaha, Sea-Doo, Bayliner, Jeanneau etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Lungime (feet / metri)
      if (attributes?.length || attributes?.lungime || attributes?.length_feet || attributes?.lungime_metri) {
        parts.push(`${attributes.length || attributes.lungime || attributes.length_feet || attributes.lungime_metri}m`);
      }
      
      // Putere motor (CP)
      if (attributes?.power || attributes?.putere || attributes?.hp || attributes?.cp || attributes?.engine_power) {
        parts.push(`${attributes.power || attributes.putere || attributes.hp || attributes.cp || attributes.engine_power}CP`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "motoare") {
      // Motoare Marine
      // Query: "motor marin {brand} {model} {putere}CP {an} de vanzare"
      parts.push("motor marin");
      
      // Brand (Yamaha, Mercury, Suzuki etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Putere (CP)
      if (attributes?.power || attributes?.putere || attributes?.hp || attributes?.cp) {
        parts.push(`${attributes.power || attributes.putere || attributes.hp || attributes.cp}CP`);
      }
      
      // Tip (2T / 4T)
      if (attributes?.engine_type || attributes?.tip_motor || attributes?.type) {
        parts.push(attributes.engine_type || attributes.tip_motor || attributes.type);
      }
      
      // Lungime ax (S, L, XL)
      if (attributes?.shaft_length || attributes?.lungime_ax || attributes?.ax_length) {
        parts.push(attributes.shaft_length || attributes.lungime_ax || attributes.ax_length);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "avioane") {
      // Avioane Mici / Ușoare / Ultraușoare
      // Query: "avion {brand} {model} {an} {ore_zbor} ore de vanzare"
      parts.push("avion");
      
      // Brand (Cessna, Piper, Tecnam, Ikarus etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Ore de zbor (TTSN)
      if (attributes?.flight_hours || attributes?.ore_zbor || attributes?.ttsn || attributes?.hours) {
        parts.push(`${attributes.flight_hours || attributes.ore_zbor || attributes.ttsn || attributes.hours} ore`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "dronuri") {
      // Dronuri Industriale
      // Query: "drona industriala {brand} {model} {kit_optional} de vanzare Romania"
      parts.push("drona industriala");
      
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model (Matrice 300, Mavic 3 Enterprise etc.)
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Accesorii (RTK, senzori termici, zoom)
      if (attributes?.accessories || attributes?.accesorii || attributes?.kit) {
        const accessories = attributes.accessories || attributes.accesorii || attributes.kit;
        if (typeof accessories === 'string') {
          parts.push(accessories);
        } else if (Array.isArray(accessories)) {
          parts.push(accessories.join(" "));
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "business" || category === "licitatii" || category === "business_licitatii" || 
             category === "office" || category === "commercial" || category === "lichidare" || category === "loturi") {
    // Detectează subcategoria pentru business & licitații
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('imprimantă') || titleLower.includes('imprimanta') || 
          titleLower.includes('copiator') || titleLower.includes('multifuncțională') || 
          titleLower.includes('multifunctionala') || titleLower.includes('scaner') || 
          titleLower.includes('shredder') || titleLower.includes('proiector') || 
          titleLower.includes('centrală telefonică') || titleLower.includes('centrala telefonica') || 
          titleLower.includes('server') || titleLower.includes('echipament birou')) {
        detectedSubcategory = "echipamente_birou";
      } else if (titleLower.includes('raft metalic') || titleLower.includes('tejghеlă') || 
                 titleLower.includes('tejghеla') || titleLower.includes('vitrină frigorifică') || 
                 titleLower.includes('vitrina frigorifica') || titleLower.includes('masă restaurant') || 
                 titleLower.includes('masa restaurant') || titleLower.includes('scaun horeca') || 
                 titleLower.includes('dulap arhivare') || titleLower.includes('mobilier recepție') || 
                 titleLower.includes('mobilier receptie') || titleLower.includes('mobilier comercial')) {
        detectedSubcategory = "mobilier_comercial";
      } else if (titleLower.includes('calculator second-hand') || titleLower.includes('calculator second hand') || 
                 titleLower.includes('desktop refurbished') || titleLower.includes('workstation') || 
                 titleLower.includes('thin client') || titleLower.includes('periferic profesional')) {
        detectedSubcategory = "calculatoare";
      } else if (titleLower.includes('lichidare') || titleLower.includes('licitație lichidare') || 
                 titleLower.includes('licitatie lichidare') || titleLower.includes('lot lichidare') || 
                 titleLower.includes('vânzare rapidă') || titleLower.includes('vanzare rapida')) {
        detectedSubcategory = "lichidari";
      } else if (titleLower.includes('lot') || titleLower.includes('stoc') || 
                 titleLower.includes('retur') || titleLower.includes('bulk')) {
        detectedSubcategory = "loturi";
      } else {
        detectedSubcategory = "echipamente_birou";
      }
    }
    
    if (detectedSubcategory === "echipamente_birou") {
      // Echipamente de Birou
      // Query: "{tip} {brand} {model} {an} {caracteristici_cheie} de vanzare Romania"
      // Tip echipament
      if (attributes?.type || attributes?.tip || attributes?.equipment_type) {
        parts.push(attributes.type || attributes.tip || attributes.equipment_type);
      } else {
        if (titleLower.includes('imprimantă') || titleLower.includes('imprimanta')) parts.push("imprimanta");
        else if (titleLower.includes('copiator')) parts.push("copiator");
        else if (titleLower.includes('multifuncțională') || titleLower.includes('multifunctionala')) parts.push("multifunctionala");
        else if (titleLower.includes('scaner')) parts.push("scaner");
        else if (titleLower.includes('shredder')) parts.push("shredder");
        else if (titleLower.includes('proiector')) parts.push("proiector");
        else if (titleLower.includes('centrală telefonică') || titleLower.includes('centrala telefonica')) parts.push("centrala telefonica");
        else if (titleLower.includes('server')) parts.push("server");
      }
      
      // Brand (HP, Canon, Xerox, Ricoh etc.)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model exact
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an || attributes?.year_production) {
        parts.push(attributes.year || attributes.an || attributes.year_production);
      }
      
      // Caracteristici cheie (viteză ppm, tehnologie, funcții)
      if (attributes?.speed || attributes?.viteza || attributes?.ppm) {
        parts.push(`${attributes.speed || attributes.viteza || attributes.ppm}ppm`);
      }
      if (attributes?.technology || attributes?.tehnologie || attributes?.tech) {
        parts.push(attributes.technology || attributes.tehnologie || attributes.tech);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "mobilier_comercial") {
      // Mobilier Comercial
      // Query: "{tip} {brand_optional} {dimensiuni} {capacitate} de vanzare Romania"
      // Tip mobilier
      if (attributes?.type || attributes?.tip || attributes?.furniture_type) {
        parts.push(attributes.type || attributes.tip || attributes.furniture_type);
      } else {
        if (titleLower.includes('raft metalic')) parts.push("raft metalic");
        else if (titleLower.includes('tejghеlă') || titleLower.includes('tejghеla')) parts.push("tejghеla");
        else if (titleLower.includes('vitrină frigorifică') || titleLower.includes('vitrina frigorifica')) parts.push("vitrina frigorifica");
        else if (titleLower.includes('masă restaurant') || titleLower.includes('masa restaurant')) parts.push("masa restaurant");
        else if (titleLower.includes('scaun horeca')) parts.push("scaun horeca");
        else if (titleLower.includes('dulap arhivare')) parts.push("dulap arhivare");
      }
      
      // Brand (opțional)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Dimensiuni
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
      }
      
      // Capacitate (litri, kg, metri liniari)
      if (attributes?.capacity || attributes?.capacitate) {
        parts.push(`${attributes.capacity || attributes.capacitate}${attributes.capacity?.toString().includes('L') || attributes.capacitate?.toString().includes('kg') ? '' : 'L'}`);
      }
      
      // Echipare (pentru vitrine: no-frost, ventilate etc.)
      if (attributes?.equipment || attributes?.echipare || attributes?.features) {
        const equipment = attributes.equipment || attributes.echipare || attributes.features;
        if (typeof equipment === 'string') {
          parts.push(equipment);
        } else if (Array.isArray(equipment)) {
          parts.push(equipment.join(" "));
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "calculatoare") {
      // Calculatoare Second-Hand
      // Query: "{brand} {model} {procesor} {ram} {ssd} de vanzare Romania"
      // Brand (Dell, HP, Lenovo)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      // Model (OptiPlex, ThinkCentre etc.)
      if (attributes?.model || attributes?.model_name) {
        parts.push(attributes.model || attributes.model_name);
      }
      
      // Procesor (i5, i7, Ryzen etc.)
      if (attributes?.processor || attributes?.procesor || attributes?.cpu) {
        parts.push(attributes.processor || attributes.procesor || attributes.cpu);
      }
      
      // RAM
      if (attributes?.ram || attributes?.memory) {
        parts.push(`${attributes.ram || attributes.memory}GB`);
      }
      
      // SSD/HDD
      if (attributes?.storage || attributes?.stocare || attributes?.ssd || attributes?.hdd) {
        parts.push(`${attributes.storage || attributes.stocare || attributes.ssd || attributes.hdd}${attributes.storage?.toString().includes('GB') || attributes.storage?.toString().includes('TB') ? '' : 'GB'}`);
        if (attributes.ssd || attributes.storage_type === 'SSD') {
          parts.push("SSD");
        }
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "lichidari") {
      // Licitații Lichidări Firme
      // Query: "lichidare firma {tip_produs} lot {cantitate} de vanzare Romania"
      parts.push("lichidare firma");
      
      // Tip echipament / lot
      if (attributes?.type || attributes?.tip || attributes?.equipment_type || attributes?.product_type) {
        parts.push(attributes.type || attributes.tip || attributes.equipment_type || attributes.product_type);
      }
      
      // Cantitate
      if (attributes?.quantity || attributes?.cantitate || attributes?.lot_size) {
        parts.push("lot", `${attributes.quantity || attributes.cantitate || attributes.lot_size} bucati`);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "loturi") {
      // Loturi Stocuri Produse
      // Query: "lot {tip_produs} {cantitate} de vanzare Romania"
      parts.push("lot");
      
      // Tip produse
      if (attributes?.type || attributes?.tip || attributes?.product_type) {
        parts.push(attributes.type || attributes.tip || attributes.product_type);
      }
      
      // Cantitate
      if (attributes?.quantity || attributes?.cantitate || attributes?.lot_size) {
        parts.push(attributes.quantity || attributes.cantitate || attributes.lot_size);
      }
      
      // Brand (dacă este unic)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "construction" || category === "materiale" || category === "constructii" || 
             category === "materiale_constructii" || category === "building_materials") {
    // Detectează subcategoria pentru materiale construcții
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('ciment') || titleLower.includes('caramida') || titleLower.includes('cărămidă') || 
          titleLower.includes('otel') || titleLower.includes('oțel') || titleLower.includes('fier beton') || 
          titleLower.includes('plasa sudata') || titleLower.includes('plasă sudată') || 
          titleLower.includes('grinda metalica') || titleLower.includes('grindă metalică')) {
        detectedSubcategory = "ciment_caramida_otel";
      } else if (titleLower.includes('polistiren') || titleLower.includes('vata minerala') || 
                 titleLower.includes('vata bazaltica') || titleLower.includes('vata sticla') || 
                 titleLower.includes('spuma poliuretanica') || titleLower.includes('spumă poliuretanică') || 
                 titleLower.includes('membrana') || titleLower.includes('izolatie') || 
                 titleLower.includes('izolație')) {
        detectedSubcategory = "izolatie";
      } else if (titleLower.includes('feronerie') || titleLower.includes('surub') || 
                 titleLower.includes('șurub') || titleLower.includes('cuie') || titleLower.includes('ancoră') || 
                 titleLower.includes('ancora') || titleLower.includes('balamale') || titleLower.includes('broasca') || 
                 titleLower.includes('broaște') || titleLower.includes('yale') || titleLower.includes('unelte') || 
                 titleLower.includes('bormasina') || titleLower.includes('bormașină') || 
                 titleLower.includes('ciocan') || titleLower.includes('trusa')) {
        detectedSubcategory = "feronerie_unelte";
      } else if (titleLower.includes('usa') || titleLower.includes('ușă') || titleLower.includes('fereastra') || 
                 titleLower.includes('fereastră') || titleLower.includes('tamplarie') || 
                 titleLower.includes('tâmplărie') || titleLower.includes('geam termopan') || 
                 titleLower.includes('rulou') || titleLower.includes('rulouri')) {
        detectedSubcategory = "usi_ferestre";
      } else {
        detectedSubcategory = "ciment_caramida_otel";
      }
    }
    
    if (detectedSubcategory === "ciment_caramida_otel") {
      // Ciment, Cărămidă, Oțel
      // Query: "{tip_material} {brand_optional} {cantitate} {unitate} de vanzare Romania"
      // Tip material
      if (attributes?.type || attributes?.tip || attributes?.material_type) {
        parts.push(attributes.type || attributes.tip || attributes.material_type);
      } else {
        if (titleLower.includes('ciment')) parts.push("ciment");
        else if (titleLower.includes('caramida') || titleLower.includes('cărămidă')) parts.push("caramida");
        else if (titleLower.includes('otel') || titleLower.includes('oțel') || titleLower.includes('fier beton')) parts.push("otel beton");
        else if (titleLower.includes('plasa sudata') || titleLower.includes('plasă sudată')) parts.push("plasa sudata");
        else if (titleLower.includes('grinda metalica') || titleLower.includes('grindă metalică')) parts.push("grinda metalica");
      }
      
      // Brand/Marcă (Holcim, CRH, Macon etc.) - dacă există
      if (attributes?.brand || attributes?.marca || attributes?.brand_name) {
        parts.push(attributes.brand || attributes.marca || attributes.brand_name);
      }
      
      // Rezistență (pentru ciment: 42.5R etc.)
      if (attributes?.strength || attributes?.rezistenta || attributes?.strength_class) {
        parts.push(attributes.strength || attributes.rezistenta || attributes.strength_class);
      }
      
      // Cantitate totală
      if (attributes?.quantity || attributes?.cantitate || attributes?.amount) {
        parts.push(attributes.quantity || attributes.cantitate || attributes.amount);
      }
      
      // Ambalare (sac / palet / tonă)
      if (attributes?.packaging || attributes?.ambalare || attributes?.unit) {
        parts.push(attributes.packaging || attributes.ambalare || attributes.unit);
      } else {
        // Detectare automată
        if (titleLower.includes('sac')) parts.push("sac");
        else if (titleLower.includes('palet')) parts.push("palet");
        else if (titleLower.includes('tona') || titleLower.includes('tonă')) parts.push("tona");
      }
      
      // Dimensiuni (pentru oțel: 12mm etc.)
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size || attributes?.diameter || attributes?.diametru) {
        parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size || attributes.diameter || attributes.diametru);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "izolatie") {
      // Materiale Izolație
      // Query: "polistiren {tip} {densitate} {grosime}cm {cantitate} m2 de vanzare Romania"
      // Tip material (EPS, XPS, vată etc.)
      if (attributes?.type || attributes?.tip || attributes?.material_type) {
        parts.push(attributes.type || attributes.tip || attributes.material_type);
      } else {
        if (titleLower.includes('polistiren expandat') || titleLower.includes('eps')) parts.push("polistiren EPS");
        else if (titleLower.includes('polistiren extrudat') || titleLower.includes('xps')) parts.push("polistiren XPS");
        else if (titleLower.includes('vata bazaltica') || titleLower.includes('vata minerala')) parts.push("vata bazaltica");
        else if (titleLower.includes('vata sticla')) parts.push("vata sticla");
        else if (titleLower.includes('spuma poliuretanica') || titleLower.includes('spumă poliuretanică')) parts.push("spuma poliuretanica");
        else if (titleLower.includes('membrana')) parts.push("membrana");
      }
      
      // Densitate (EPS 80, EPS 100 etc.) (identică pentru filtrare)
      if (attributes?.density || attributes?.densitate || attributes?.density_class) {
        parts.push(`${attributes.density || attributes.densitate || attributes.density_class}kg/m3`);
      }
      
      // Grosime (cm) (identică pentru filtrare)
      if (attributes?.thickness || attributes?.grosime || attributes?.thickness_cm) {
        parts.push(`${attributes.thickness || attributes.grosime || attributes.thickness_cm}cm`);
      }
      
      // Cantitate (m² / pachet)
      if (attributes?.quantity || attributes?.cantitate || attributes?.area || attributes?.suprafata) {
        parts.push(`${attributes.quantity || attributes.cantitate || attributes.area || attributes.suprafata}m2`);
      }
      
      // Brand
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    } else if (detectedSubcategory === "feronerie_unelte") {
      // Feronerie, Unelte
      // Query (feronerie): "{tip} {dimensiune} {material} {cantitate} de vanzare"
      // Query (unelte): "{brand} {model} {putere}W de vanzare Romania"
      const isTool = titleLower.includes('bormasina') || titleLower.includes('bormașină') || 
                     titleLower.includes('unelte electrice') || titleLower.includes('unelte manuale') ||
                     titleLower.includes('makita') || titleLower.includes('bosch') || titleLower.includes('dewalt');
      
      if (isTool) {
        // Unelte electrice
        // Brand
        if (attributes?.brand || attributes?.marca) {
          parts.push(attributes.brand || attributes.marca);
        }
        
        // Model
        if (attributes?.model || attributes?.model_name) {
          parts.push(attributes.model || attributes.model_name);
        }
        
        // Putere (W)
        if (attributes?.power || attributes?.putere || attributes?.watt) {
          parts.push(`${attributes.power || attributes.putere || attributes.watt}W`);
        }
        
        // Baterie (Ah)
        if (attributes?.battery || attributes?.baterie || attributes?.battery_ah) {
          parts.push(`${attributes.battery || attributes.baterie || attributes.battery_ah}Ah`);
        }
        
        parts.push("de vanzare", "România");
        if (city) parts.push(city);
      } else {
        // Feronerie
        // Tip piesă
        if (attributes?.type || attributes?.tip || attributes?.part_type) {
          parts.push(attributes.type || attributes.tip || attributes.part_type);
        }
        
        // Dimensiuni (identică pentru filtrare)
        if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size) {
          parts.push(attributes.dimensions || attributes.dimensiuni || attributes.size);
        }
        
        // Material (inox, zincat etc.) (identic pentru filtrare)
        if (attributes?.material || attributes?.material_type) {
          parts.push(attributes.material || attributes.material_type);
        }
        
        // Cantitate (±10% pentru filtrare)
        if (attributes?.quantity || attributes?.cantitate) {
          parts.push(`${attributes.quantity || attributes.cantitate} buc`);
        }
        
        // Brand (dacă există)
        if (attributes?.brand || attributes?.marca) {
          parts.push(attributes.brand || attributes.marca);
        }
        
        parts.push("de vanzare", "România");
        if (city) parts.push(city);
      }
    } else if (detectedSubcategory === "usi_ferestre") {
      // Uși, Ferestre, Tâmplărie
      // Query: "usa {material} {dimensiuni} {brand_optional} de vanzare Romania"
      // Tip (ușă / fereastră / glisantă etc.)
      if (attributes?.type || attributes?.tip || attributes?.product_type) {
        parts.push(attributes.type || attributes.tip || attributes.product_type);
      } else {
        if (titleLower.includes('usa') || titleLower.includes('ușă')) parts.push("usa");
        else if (titleLower.includes('fereastra') || titleLower.includes('fereastră')) parts.push("fereastra");
        else if (titleLower.includes('glisant')) parts.push("glisant");
        else if (titleLower.includes('rulou') || titleLower.includes('rulouri')) parts.push("rulou");
      }
      
      // Material (PVC, aluminiu, lemn) (identic pentru filtrare)
      if (attributes?.material || attributes?.material_type) {
        parts.push(attributes.material || attributes.material_type);
      }
      
      // Dimensiuni exacte (±10% pentru filtrare)
      if (attributes?.dimensions || attributes?.dimensiuni || attributes?.size || attributes?.width || attributes?.height) {
        const dims = attributes.dimensions || attributes.dimensiuni || attributes.size;
        if (dims) {
          parts.push(dims);
        } else if (attributes.width && attributes.height) {
          parts.push(`${attributes.width}x${attributes.height}`);
        }
      }
      
      // Brand profil (Rehau, Veka, Salamander etc.) (identic pentru filtrare)
      if (attributes?.brand || attributes?.marca || attributes?.profile_brand) {
        parts.push(attributes.brand || attributes.marca || attributes.profile_brand);
      }
      
      // Tip deschidere (opțional)
      if (attributes?.opening_type || attributes?.tip_deschidere) {
        parts.push(attributes.opening_type || attributes.tip_deschidere);
      }
      
      parts.push("de vanzare", "România");
      if (city) parts.push(city);
    }
  } else if (category === "diverse" || category === "speciale" || category === "diverse_speciale" || 
             category === "special" || category === "unique" || category === "rare") {
    // Detectează subcategoria pentru diverse / speciale
    const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                        (attributes?.type || attributes?.tip);
    const titleLower = title.toLowerCase();
    
    // Detectare automată subcategorie din titlu
    let detectedSubcategory = subcategory;
    if (!detectedSubcategory) {
      if (titleLower.includes('licitație caritabilă') || titleLower.includes('licitatie caritabila') || 
          titleLower.includes('donatie') || titleLower.includes('donație') || 
          titleLower.includes('charity auction') || titleLower.includes('caritabil')) {
        detectedSubcategory = "licitatii_caritable";
      } else if (titleLower.includes('militar') || titleLower.includes('istoric') || 
                 titleLower.includes('wwii') || titleLower.includes('wwi') || 
                 titleLower.includes('uniforma') || titleLower.includes('uniformă') || 
                 titleLower.includes('medalie') || titleLower.includes('arma dezactivata') || 
                 titleLower.includes('armă dezactivată') || titleLower.includes('relicva') || 
                 titleLower.includes('relicvă')) {
        detectedSubcategory = "militare_istorice";
      } else if (titleLower.includes('nft') || titleLower.includes('artă digitală') || 
                 titleLower.includes('arta digitala') || titleLower.includes('digital art') || 
                 titleLower.includes('blockchain') || titleLower.includes('crypto art')) {
        detectedSubcategory = "nft_arta_digitala";
      } else if (titleLower.includes('colecție') || titleLower.includes('colectie') || 
                 titleLower.includes('moneda') || titleLower.includes('monedă') || 
                 titleLower.includes('bancnota') || titleLower.includes('bancnotă') || 
                 titleLower.includes('figurina') || titleLower.includes('timbru') || 
                 titleLower.includes('pokemon') || titleLower.includes('funko')) {
        detectedSubcategory = "colectii_private";
      } else if (titleLower.includes('confiscat') || titleLower.includes('executare') || 
                 titleLower.includes('anabi') || titleLower.includes('executor') || 
                 titleLower.includes('sechestru')) {
        detectedSubcategory = "confiscate_executari";
      } else {
        detectedSubcategory = "licitatii_caritable";
      }
    }
    
    if (detectedSubcategory === "licitatii_caritable") {
      // Licitații Caritabile
      // Query: "{tip_obiect} value price Romania Europa"
      // Tip obiect
      if (attributes?.type || attributes?.tip || attributes?.object_type) {
        parts.push(attributes.type || attributes.tip || attributes.object_type);
      }
      
      // Dacă este asociat unei personalități
      if (attributes?.personality || attributes?.personalitate || attributes?.celebrity || attributes?.vedeta) {
        parts.push("semnat", attributes.personality || attributes.personalitate || attributes.celebrity || attributes.vedeta);
      }
      
      parts.push("value", "price", "România", "Europa");
    } else if (detectedSubcategory === "militare_istorice") {
      // Obiecte Militare / Istorice
      // Query: "{numele_obiectului} original {an/perioada} value price Europe"
      // Tip obiect
      if (attributes?.type || attributes?.tip || attributes?.object_type) {
        parts.push(attributes.type || attributes.tip || attributes.object_type);
      }
      
      // Perioadă istorică
      if (attributes?.period || attributes?.perioada || attributes?.historical_period) {
        parts.push(attributes.period || attributes.perioada || attributes.historical_period);
      } else if (attributes?.year || attributes?.an) {
        parts.push(attributes.year || attributes.an);
      }
      
      // Original / replică
      if (attributes?.original || attributes?.original_item || attributes?.replica) {
        if (attributes.original || attributes.original_item) {
          parts.push("original");
        } else if (attributes.replica) {
          parts.push("replica");
        }
      } else {
        parts.push("original");
      }
      
      parts.push("value", "price", "Europe");
    } else if (detectedSubcategory === "nft_arta_digitala") {
      // NFT / Artă Digitală
      // Query: "{nume_NFT} floor price {blockchain}" sau "{collection_name} NFT value"
      // Nume NFT / Colecție
      if (attributes?.name || attributes?.nume || attributes?.nft_name || attributes?.collection_name) {
        parts.push(attributes.name || attributes.nume || attributes.nft_name || attributes.collection_name);
      } else {
        parts.push(title);
      }
      
      // Blockchain
      if (attributes?.blockchain || attributes?.chain) {
        parts.push("floor price", attributes.blockchain || attributes.chain);
      } else {
        parts.push("NFT", "value");
      }
    } else if (detectedSubcategory === "colectii_private") {
      // Colecții Private
      // Query: "{nume_obiect}, {an}, {raritate}, value price"
      // Nume obiect
      if (attributes?.name || attributes?.nume || attributes?.item_name) {
        parts.push(attributes.name || attributes.nume || attributes.item_name);
      } else {
        parts.push(title);
      }
      
      // An
      if (attributes?.year || attributes?.an) {
        parts.push(attributes.year || attributes.an);
      }
      
      // Raritate
      if (attributes?.rarity || attributes?.raritate || attributes?.rarity_level) {
        parts.push(attributes.rarity || attributes.raritate || attributes.rarity_level);
      }
      
      // Stare (UNC, PROOF, circulated)
      if (attributes?.condition || attributes?.stare || attributes?.grade) {
        parts.push(attributes.condition || attributes.stare || attributes.grade);
      }
      
      parts.push("value", "price");
    } else if (detectedSubcategory === "confiscate_executari") {
      // Bunuri Confiscate / Executări
      // Query: "{tip_produs} {brand_optional} valoare piata Romania"
      // Tip bun
      if (attributes?.type || attributes?.tip || attributes?.product_type) {
        parts.push(attributes.type || attributes.tip || attributes.product_type);
      }
      
      // Brand (opțional)
      if (attributes?.brand || attributes?.marca) {
        parts.push(attributes.brand || attributes.marca);
      }
      
      parts.push("valoare", "piata", "România");
    }
  } else if (category === "fashion") {
    // Fallback pentru modă generice
    const brandMatch = title.match(/^([A-Z][a-z]+)/);
    if (brandMatch) parts.push(brandMatch[1]);
    parts.push(title.split(" ").slice(0, 2).join(" "), "preț", "vânzare");
    if (attributes?.condition) parts.push(attributes.condition);
  } else {
    // Generic
    parts.push(title, "preț", "vânzare");
    if (city) parts.push(city);
    parts.push("România");
  }

  return parts.join(" ");
}

/**
 * Construiește context specific categoriei pentru AI
 */
export function buildCategorySpecificContext(product: {
  title: string;
  description?: string;
  category: string;
  city?: string;
  area?: string;
  attributes?: Record<string, any>;
}): string {
  const { title, description, category, city, area, attributes } = product;
  const contextParts: string[] = [];

  // Detectează subcategoria pentru autovehicule
  const subcategory = attributes?.subcategory || attributes?.subcategorie || 
                      (category === "auto" ? "autoturisme" : null);
  const titleLower = title.toLowerCase();
  
  // Detectare automată subcategorie din titlu
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('suv') || titleLower.includes('4x4') || titleLower.includes('awd')) {
      detectedSubcategory = "suv";
    } else if (titleLower.includes('motocicletă') || titleLower.includes('motocicleta') || 
               titleLower.includes('scuter') || titleLower.includes('motorcycle')) {
      detectedSubcategory = "motociclete";
    } else if (titleLower.includes('camion') || titleLower.includes('truck')) {
      detectedSubcategory = "camioane";
    } else if (titleLower.includes('remorcă') || titleLower.includes('remorca') || 
               titleLower.includes('semiremorcă') || titleLower.includes('semiremorca')) {
      detectedSubcategory = "remorci";
    } else if (titleLower.includes('autorulotă') || titleLower.includes('autorulota') || 
               titleLower.includes('rulotă') || titleLower.includes('rulota') || 
               titleLower.includes('motorhome')) {
      detectedSubcategory = "autorulote";
    } else if (titleLower.includes('tesla') || titleLower.includes('electric') || 
               titleLower.includes('electrică') || titleLower.includes('ev')) {
      detectedSubcategory = "electrice";
    } else if (titleLower.includes('piesă') || titleLower.includes('piesa') || 
               titleLower.includes('accesoriu') || titleLower.includes('alternator')) {
      detectedSubcategory = "piese";
    } else {
      detectedSubcategory = "autoturisme";
    }
  }
  
  if (category === "auto" || category === "autovehicule") {
    if (detectedSubcategory === "suv" || detectedSubcategory === "suv_4x4") {
      // SUV / 4x4
      contextParts.push(`SUV/4x4: ${title}`);
      
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
      }
      if (attributes?.engine || attributes?.motorizare) {
        contextParts.push(`Motorizare: ${attributes.engine || attributes.motorizare}`);
      }
      if (attributes?.fuel || attributes?.combustibil) {
        contextParts.push(`Combustibil: ${attributes.fuel || attributes.combustibil}`);
      }
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      if (attributes?.drive || attributes?.tractiune || attributes?.tracțiune) {
        contextParts.push(`Tracțiune: ${attributes.drive || attributes.tractiune || attributes.tracțiune}`);
      }
      if (attributes?.offroad || attributes?.off_road || attributes?.sistem_offroad) {
        contextParts.push(`Sistem off-road: ${attributes.offroad || attributes.off_road || attributes.sistem_offroad}`);
      }
      if (attributes?.warranty || attributes?.garantie || attributes?.revizii) {
        contextParts.push(`Garanție/Revizii: ${attributes.warranty || attributes.garantie || attributes.revizii}`);
      }
      if (attributes?.equipment || attributes?.echipare) {
        const equipment = attributes.equipment || attributes.echipare;
        if (typeof equipment === 'string') {
          contextParts.push(`Echipare: ${equipment}`);
        } else if (Array.isArray(equipment)) {
          contextParts.push(`Echipare: ${equipment.join(", ")}`);
        }
      }
      
    if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "motociclete" || detectedSubcategory === "scutere") {
      // Motociclete și Scutere
      contextParts.push(`Motocicletă/Scuter: ${title}`);
      
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      if (attributes?.displacement || attributes?.cilindree || attributes?.cc) {
        contextParts.push(`Cilindree: ${attributes.displacement || attributes.cilindree || attributes.cc}cc`);
      }
      if (attributes?.type || attributes?.tip) {
        contextParts.push(`Tip: ${attributes.type || attributes.tip}`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An: ${attributes.year || attributes.an}`);
      }
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      if (attributes?.power || attributes?.putere) {
        contextParts.push(`Putere: ${attributes.power || attributes.putere} CP`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "camioane") {
      // Camioane
      contextParts.push(`Camion: ${title}`);
      
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      if (attributes?.tonnage || attributes?.tonaj) {
        contextParts.push(`Tonaj: ${attributes.tonnage || attributes.tonaj}T`);
      }
      if (attributes?.power || attributes?.putere || attributes?.hp) {
        contextParts.push(`Putere: ${attributes.power || attributes.putere || attributes.hp} CP`);
      }
      if (attributes?.axles || attributes?.axe || attributes?.configuratie_axe) {
        contextParts.push(`Configurație axe: ${attributes.axles || attributes.axe || attributes.configuratie_axe}`);
      }
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      if (attributes?.body || attributes?.caroserie) {
        contextParts.push(`Caroserie: ${attributes.body || attributes.caroserie}`);
      }
      if (attributes?.euro || attributes?.euro_norm) {
        contextParts.push(`Normă Euro: Euro${attributes.euro || attributes.euro_norm}`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "remorci" || detectedSubcategory === "semiremorci") {
      // Remorci și Semiremorci
      contextParts.push(`Remorcă/Semiremorcă: ${title}`);
      
      if (attributes?.type || attributes?.tip) {
        contextParts.push(`Tip: ${attributes.type || attributes.tip}`);
      }
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
      }
      if (attributes?.axles || attributes?.axe) {
        contextParts.push(`Axuri: ${attributes.axles || attributes.axe} axe`);
      }
      if (attributes?.body || attributes?.caroserie || attributes?.tip_caroserie) {
        contextParts.push(`Caroserie: ${attributes.body || attributes.caroserie || attributes.tip_caroserie}`);
      }
      if (attributes?.insulated || attributes?.izoterm || attributes?.prelata) {
        contextParts.push(`Prelată/Izoterm: ${attributes.insulated || attributes.izoterm || attributes.prelata}`);
      }
      if (attributes?.brakes || attributes?.frane || attributes?.sistem_franare) {
        contextParts.push(`Sistem frânare: ${attributes.brakes || attributes.frane || attributes.sistem_franare}`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "autorulote" || detectedSubcategory === "rulote") {
      // Autorulote / Rulote
      contextParts.push(`Autorulotă/Rulotă: ${title}`);
      
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An: ${attributes.year || attributes.an}`);
      }
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      if (attributes?.seats || attributes?.locuri) {
        contextParts.push(`Număr locuri: ${attributes.seats || attributes.locuri}`);
      }
      if (attributes?.features || attributes?.dotari || attributes?.echipare) {
        const features = attributes.features || attributes.dotari || attributes.echipare;
        if (typeof features === 'string') {
          contextParts.push(`Dotări: ${features}`);
        } else if (Array.isArray(features)) {
          contextParts.push(`Dotări: ${features.join(", ")}`);
        }
      }
      if (attributes?.axle || attributes?.axa || attributes?.tip_axa) {
        contextParts.push(`Tip rulotă: ${attributes.axle || attributes.axa || attributes.tip_axa}`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "electrice" || detectedSubcategory === "vehicule_electrice") {
      // Vehicule Electrice
      contextParts.push(`Vehicul Electric: ${title}`);
      
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      if (attributes?.battery || attributes?.baterie || attributes?.kwh) {
        contextParts.push(`Capacitate baterie: ${attributes.battery || attributes.baterie || attributes.kwh} kWh`);
      }
      if (attributes?.range || attributes?.autonomie || attributes?.autonomie_wltp) {
        contextParts.push(`Autonomie WLTP: ${attributes.range || attributes.autonomie || attributes.autonomie_wltp} km`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An: ${attributes.year || attributes.an}`);
      }
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      if (attributes?.battery_degradation || attributes?.degradare_baterie) {
        contextParts.push(`Degradare baterie: ${attributes.battery_degradation || attributes.degradare_baterie}%`);
      }
      if (attributes?.charging || attributes?.incarcare || attributes?.tip_incarcare) {
        contextParts.push(`Tip încărcare: ${attributes.charging || attributes.incarcare || attributes.tip_incarcare}`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else if (detectedSubcategory === "piese" || detectedSubcategory === "piese_auto") {
      // Piese Auto – BRAND = mașină, MODEL, CAPACITATE CILINDRICĂ, AN obligatorii pentru căutare precisă
      contextParts.push(`Piesă Auto/Accesoriu: ${title}`);
      
      if (attributes?.part || attributes?.piesa || attributes?.tip_piesa) {
        contextParts.push(`Tip piesă: ${attributes.part || attributes.piesa || attributes.tip_piesa}`);
      }
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand mașină: ${attributes.brand || attributes.marca}`);
      }
      if (attributes?.model || attributes?.model_compatibil) {
        contextParts.push(`Model mașină: ${attributes.model || attributes.model_compatibil}`);
      }
      if (attributes?.capacitate_cilindrica ?? attributes?.capacitateCilindrica ?? attributes?.engine ?? attributes?.motorizare) {
        contextParts.push(`Capacitate cilindrică: ${attributes.capacitate_cilindrica ?? attributes.capacitateCilindrica ?? attributes.engine ?? attributes.motorizare} cm³`);
      }
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An fabricație mașină: ${attributes.year || attributes.an}`);
      }
      if (attributes?.condition || attributes?.stare || attributes?.type_part) {
        contextParts.push(`Stare: ${attributes.condition || attributes.stare || attributes.type_part}`);
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    } else {
      // Autoturisme (default)
      contextParts.push(`Autoturism: ${title}`);
      
      // Brand (Marca)
      if (attributes?.brand || attributes?.marca) {
        contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
      }
      
      // Model
      if (attributes?.model) {
        contextParts.push(`Model: ${attributes.model}`);
      }
      
      // An fabricație
      if (attributes?.year || attributes?.an) {
        contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
      }
      
      // Motorizare
      if (attributes?.engine || attributes?.motorizare) {
        contextParts.push(`Motorizare: ${attributes.engine || attributes.motorizare}`);
      }
      
      // Tip combustibil
      if (attributes?.fuel || attributes?.combustibil || attributes?.tip_combustibil) {
        contextParts.push(`Tip combustibil: ${attributes.fuel || attributes.combustibil || attributes.tip_combustibil}`);
      }
      
      // Km parcurși
      if (attributes?.km || attributes?.kilometraj) {
        contextParts.push(`Kilometraj: ${attributes.km || attributes.kilometraj} km`);
      }
      
      // Putere + transmisie
      if (attributes?.power || attributes?.putere) {
        contextParts.push(`Putere: ${attributes.power || attributes.putere} CP`);
      }
      if (attributes?.transmission || attributes?.transmisie) {
        contextParts.push(`Transmisie: ${attributes.transmission || attributes.transmisie}`);
      }
      
      // Nivel de echipare
      if (attributes?.trim || attributes?.echipare || attributes?.nivel_echipare) {
        contextParts.push(`Nivel echipare: ${attributes.trim || attributes.echipare || attributes.nivel_echipare}`);
      }
      
      // Istoric service
      if (attributes?.service_history || attributes?.istoric_service || attributes?.service) {
        contextParts.push(`Istoric service: ${attributes.service_history || attributes.istoric_service || attributes.service}`);
      }
      
      // Număr proprietari
      if (attributes?.owners || attributes?.proprietari || attributes?.numar_proprietari) {
        contextParts.push(`Număr proprietari: ${attributes.owners || attributes.proprietari || attributes.numar_proprietari}`);
      }
      
      // Echipare / opțiuni
      if (attributes?.equipment || attributes?.echipare || attributes?.options || attributes?.optiuni) {
        const equipment = attributes.equipment || attributes.echipare || attributes.options || attributes.optiuni;
        if (typeof equipment === 'string') {
          contextParts.push(`Echipare: ${equipment}`);
        } else if (Array.isArray(equipment)) {
          contextParts.push(`Echipare: ${equipment.join(", ")}`);
        } else if (typeof equipment === 'object') {
          const options = Object.entries(equipment)
            .filter(([_, value]) => value === true || value === 'true' || value === 'yes')
            .map(([key, _]) => key);
          if (options.length > 0) {
            contextParts.push(`Echipare: ${options.join(", ")}`);
          }
        }
      }
      
      if (city) contextParts.push(`Locație: ${city}`);
    }
  } else if (category === "apartment" || category === "imobiliare") {
    contextParts.push(`Apartament: ${title}`);
    
    // 1. Orașul (CRITIC pentru filtrare: același oraș)
    if (city) contextParts.push(`Oraș: ${city}`);
    
    // 2. Zona exactă / cartierul (CRITICĂ pentru filtrare: aceeași zonă/cartier)
    if (area) contextParts.push(`Zonă/Cartier: ${area}`);
    if (attributes?.zone || attributes?.cartier || attributes?.sector) {
      contextParts.push(`Zonă exactă: ${attributes.zone || attributes.cartier || attributes.sector}`);
    }
    
    // 3. Suprafața utilă (mp) - CRITIC pentru filtrare (±10%)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_utila || attributes?.mp) {
      const surface = attributes.surface || attributes.suprafata || attributes.suprafata_utila || attributes.mp;
      contextParts.push(`Suprafață utilă: ${surface} mp`);
    }
    
    // 4. Număr camere (CRITIC pentru filtrare)
    if (attributes?.rooms || attributes?.camere || attributes?.numar_camere) {
      contextParts.push(`Număr camere: ${attributes.rooms || attributes.camere || attributes.numar_camere}`);
    }
    
    // 5. Anul construcției (±5 ani pentru filtrare)
    if (attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_construcție) {
      const year = attributes.year || attributes.an || attributes.anConstructie || attributes.an_construcție;
      contextParts.push(`An construcție: ${year}`);
      
      // Clasificare bloc vechi vs nou
      const yearNum = parseInt(String(year));
      if (yearNum >= 1960 && yearNum <= 1989) {
        contextParts.push(`Tip bloc: Bloc vechi (1960-1989)`);
      } else if (yearNum >= 2000) {
        contextParts.push(`Tip bloc: Bloc nou (2000+)`);
      }
    }
    
    // Construcție nouă / veche
    const year = attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_construcție;
    if (year) {
      const yearNum = parseInt(String(year));
      if (yearNum >= 2000) {
        contextParts.push(`Construcție: Nouă`);
      } else {
        contextParts.push(`Construcție: Veche`);
      }
    }
    
    // Structură beton vs cărămidă
    if (attributes?.structure || attributes?.structura || attributes?.material) {
      contextParts.push(`Structură: ${attributes.structure || attributes.structura || attributes.material}`);
    }
    
    // 6. Etaj (similar pentru filtrare: intermediar vs parter vs ultim)
    if (attributes?.floor || attributes?.etaj) {
      const floor = attributes.floor || attributes.etaj;
      const totalFloors = attributes?.totalFloors || attributes?.total_etaje || attributes?.totalEtaje;
      if (totalFloors) {
        contextParts.push(`Etaj: ${floor}/${totalFloors}`);
        
        // Evaluare etaj (similar pentru filtrare)
        if (floor === 0) {
          contextParts.push(`Tip etaj: Parter (preț mai mic)`);
        } else if (floor === totalFloors) {
          contextParts.push(`Tip etaj: Ultim etaj (preț mai mic)`);
        } else if (floor > 0 && floor < totalFloors) {
          contextParts.push(`Tip etaj: Etaj intermediar (preț optim)`);
        }
      } else {
        contextParts.push(`Etaj: ${floor}`);
      }
    }
    
    // Etaje totale bloc
    if (attributes?.totalFloors || attributes?.total_etaje || attributes?.totalEtaje) {
      contextParts.push(`Etaje totale bloc: ${attributes.totalFloors || attributes.total_etaje || attributes.totalEtaje}`);
    }
    
    // 7. Compartimentare (identică pentru filtrare)
    if (attributes?.compartimentare || attributes?.layout) {
      contextParts.push(`Compartimentare: ${attributes.compartimentare || attributes.layout}`);
    }
    
    // 8. Lift (da / nu)
    if (attributes?.lift || attributes?.elevator) {
      const hasLift = attributes.lift || attributes.elevator;
      contextParts.push(`Lift: ${hasLift ? "Da" : "Nu"}`);
    }
    
    // 9. Îmbunătățiri (renovat / lux / mobilat / centrală proprie)
    if (attributes?.renovated || attributes?.renovat) {
      contextParts.push(`Renovat: ${attributes.renovated || attributes.renovat}`);
    }
    if (attributes?.lux || attributes?.luxury) {
      contextParts.push(`Lux: Da`);
    }
    if (attributes?.furnished || attributes?.mobilat || attributes?.utilat) {
      contextParts.push(`Mobilat/Utilat: ${attributes.furnished || attributes.mobilat || attributes.utilat}`);
    }
    if (attributes?.centrala || attributes?.centrala_proprie) {
      contextParts.push(`Centrală proprie: ${attributes.centrala || attributes.centrala_proprie}`);
    }
    if (attributes?.thermopan || attributes?.termopan) {
      contextParts.push(`Termopan: ${attributes.thermopan || attributes.termopan ? "Da" : "Nu"}`);
    }
    if (attributes?.parquet || attributes?.parchet || attributes?.gresie) {
      contextParts.push(`Pardoseală: ${attributes.parquet || attributes.parchet || attributes.gresie}`);
    }
    
    // Parcare
    if (attributes?.parking || attributes?.parcare) {
      contextParts.push(`Parcare: ${attributes.parking || attributes.parcare ? "Da" : "Nu"}`);
    }
    
    // Locație față de metrou / transport
    if (attributes?.metro || attributes?.metrou || attributes?.transport || attributes?.transport_public) {
      contextParts.push(`Transport: ${attributes.metro || attributes.metrou || attributes.transport || attributes.transport_public}`);
    }
    
    if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
  } else if (category === "house" || category === "vila" || category === "casa") {
    contextParts.push(`Casă/Vilă: ${title}`);
    
    // 1. Oraș / zonă / stradă
    if (city) contextParts.push(`Oraș: ${city}`);
    if (area) contextParts.push(`Zonă: ${area}`);
    if (attributes?.zone || attributes?.cartier) {
      contextParts.push(`Zonă exactă: ${attributes.zone || attributes.cartier}`);
    }
    
    // 2. Suprafața construită / utilă
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_construita || attributes?.suprafata_utila) {
      const surface = attributes.surface || attributes.suprafata || attributes.suprafata_construita || attributes.suprafata_utila;
      contextParts.push(`Suprafață construită/utilă: ${surface} mp`);
    }
    
    // 3. Suprafața terenului
    if (attributes?.land || attributes?.teren || attributes?.suprafata_teren) {
      contextParts.push(`Suprafață teren: ${attributes.land || attributes.teren || attributes.suprafata_teren} mp`);
    }
    
    // 4. Anul construcției
    if (attributes?.year || attributes?.an || attributes?.anConstructie) {
      contextParts.push(`An construcție: ${attributes.year || attributes.an || attributes.anConstructie}`);
    }
    
    // 5. Material structură
    if (attributes?.structure || attributes?.material || attributes?.structura) {
      contextParts.push(`Material structură: ${attributes.structure || attributes.material || attributes.structura}`);
    }
    
    // 6. Structură niveluri
    if (attributes?.levels || attributes?.niveluri || attributes?.etaje) {
      contextParts.push(`Niveluri: ${attributes.levels || attributes.niveluri || attributes.etaje}`);
    }
    
    // 7. Curte amenajată / acces auto / garaj
    if (attributes?.yard || attributes?.curte) {
      contextParts.push(`Curte: ${attributes.yard || attributes.curte}`);
    }
    if (attributes?.garage || attributes?.garaj) {
      contextParts.push(`Garaj: ${attributes.garage || attributes.garaj ? "Da" : "Nu"}`);
    }
    if (attributes?.car_access || attributes?.acces_auto) {
      contextParts.push(`Acces auto: ${attributes.car_access || attributes.acces_auto ? "Da" : "Nu"}`);
    }
    
    // 8. Renovări / finisaje
    if (attributes?.renovated || attributes?.renovat) {
      contextParts.push(`Renovat: ${attributes.renovated || attributes.renovat}`);
    }
    if (attributes?.finishing || attributes?.finisaje) {
      contextParts.push(`Finisaje: ${attributes.finishing || attributes.finisaje}`);
    }
    
    // 9. Utilități
    if (attributes?.utilities || attributes?.utilitati) {
      const utilities = attributes.utilities || attributes.utilitati;
      if (typeof utilities === 'string') {
        contextParts.push(`Utilități: ${utilities}`);
      } else if (Array.isArray(utilities)) {
        contextParts.push(`Utilități: ${utilities.join(", ")}`);
      }
    }
    
    if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
  } else if (category === "land" || category === "teren") {
    // Detectează tip teren: intravilan vs agricol
    const landType = attributes?.land_type || attributes?.tip_teren || 
                     (attributes?.intravilan === true || attributes?.intravilan === 'true' ? "intravilan" : null) ||
                     (attributes?.agricol === true || attributes?.agricol === 'true' ? "agricol" : null);
    const titleLower = title.toLowerCase();
    const isAgricultural = landType === "agricol" || titleLower.includes('agricol') || 
                          titleLower.includes('arabil') || titleLower.includes('fâneață') || 
                          titleLower.includes('faneata') || titleLower.includes('pășune') || 
                          titleLower.includes('pasune');
    
    if (isAgricultural) {
      // Terenuri Agricole
      contextParts.push(`Teren Agricol: ${title}`);
      
      // Localitate / județ
      if (city) contextParts.push(`Localitate: ${city}`);
      if (attributes?.county || attributes?.judet) {
        contextParts.push(`Județ: ${attributes.county || attributes.judet}`);
      }
      
      // Suprafață (ha)
      if (attributes?.surface || attributes?.suprafata || attributes?.ha || attributes?.hectare) {
        contextParts.push(`Suprafață: ${attributes.surface || attributes.suprafata || attributes.ha || attributes.hectare} ha`);
      }
      
      // Categoria (arabil, fâneață, pășune)
      if (attributes?.category || attributes?.categorie || attributes?.tip_categorie) {
        contextParts.push(`Categorie: ${attributes.category || attributes.categorie || attributes.tip_categorie}`);
      }
      
      // Calitatea solului (bonitatea)
      if (attributes?.soil_quality || attributes?.calitate_sol || attributes?.bonitate) {
        contextParts.push(`Bonitate sol: ${attributes.soil_quality || attributes.calitate_sol || attributes.bonitate}`);
      }
      
      // Acces drum
      if (attributes?.road_access || attributes?.acces_drum) {
        contextParts.push(`Acces drum: ${attributes.road_access || attributes.acces_drum ? "Da" : "Nu"}`);
      }
      
      // Irigații
      if (attributes?.irrigation || attributes?.irigatii) {
        contextParts.push(`Irigații: ${attributes.irrigation || attributes.irigatii ? "Da" : "Nu"}`);
      }
      
      if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
    } else {
      // Terenuri Intravilane
      contextParts.push(`Teren Intravilan: ${title}`);
      
      // 1. Oraș / comună / sat
      if (city) contextParts.push(`Oraș/Comună/Sat: ${city}`);
      if (area) contextParts.push(`Zonă: ${area}`);
      
      // 2. Zonă (intravilan / extravilan) - MUST!
      if (attributes?.intravilan === true || attributes?.intravilan === 'true') {
        contextParts.push(`Zonă: Intravilan`);
      } else if (attributes?.extravilan === true || attributes?.extravilan === 'true') {
        contextParts.push(`Zonă: Extravilan`);
      } else if (attributes?.zone || attributes?.zona) {
        const zone = attributes.zone || attributes.zona;
        if (zone.toLowerCase().includes('intravilan')) {
          contextParts.push(`Zonă: Intravilan`);
        } else if (zone.toLowerCase().includes('extravilan')) {
          contextParts.push(`Zonă: Extravilan`);
        } else {
          contextParts.push(`Zonă: ${zone}`);
        }
      }
      
      // 3. Suprafață (mp)
      if (attributes?.surface || attributes?.suprafata || attributes?.mp) {
        contextParts.push(`Suprafață: ${attributes.surface || attributes.suprafata || attributes.mp} mp`);
      }
      
      // 4. Front stradal (metri)
      if (attributes?.front || attributes?.front_stradal || attributes?.deschidere) {
        contextParts.push(`Front stradal: ${attributes.front || attributes.front_stradal || attributes.deschidere} m`);
      }
      
      // 5. Utilități (gaz, curent, apă, canalizare) - identice pentru filtrare
      if (attributes?.utilities || attributes?.utilitati) {
        const utilities = attributes.utilities || attributes.utilitati;
        if (typeof utilities === 'string') {
          contextParts.push(`Utilități: ${utilities}`);
        } else if (Array.isArray(utilities)) {
          contextParts.push(`Utilități: ${utilities.join(", ")}`);
        }
      }
      
      // 6. Tip teren (construcții, duplex, industrial)
      if (attributes?.type || attributes?.tip || attributes?.tip_teren) {
        contextParts.push(`Tip teren: ${attributes.type || attributes.tip || attributes.tip_teren}`);
      }
      
      // 7. POT / CUT
      if (attributes?.pot || attributes?.cut || attributes?.pud || attributes?.pug) {
        contextParts.push(`Plan urbanistic: ${attributes.pot || attributes.cut || attributes.pud || attributes.pug}`);
      }
      
      // 8. Regim urbanistic
      if (attributes?.regim || attributes?.regim_urbanistic || attributes?.urbanistic) {
        contextParts.push(`Regim urbanistic: ${attributes.regim || attributes.regim_urbanistic || attributes.urbanistic}`);
      }
      
      if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
    }
  } else if (category === "commercial" || category === "spatiu_comercial" || category === "birouri") {
    contextParts.push(`Spațiu Comercial: ${title}`);
    
    // 1. Oraș
    if (city) contextParts.push(`Oraș: ${city}`);
    
    // 2. Zonă (central, ultracentral, piață, mall, bulevard) - CRITIC pentru filtrare (aceeași zonă)
    if (area) contextParts.push(`Zonă: ${area}`);
    if (attributes?.zone || attributes?.zona || attributes?.location_type || attributes?.tip_zona) {
      const zone = attributes.zone || attributes.zona || attributes.location_type || attributes.tip_zona;
      contextParts.push(`Zonă exactă: ${zone}`);
      
      // Clasificare tip zonă
      const zoneLower = String(zone).toLowerCase();
      if (zoneLower.includes('central') || zoneLower.includes('centru')) {
        contextParts.push(`Tip zonă: Central`);
      } else if (zoneLower.includes('mall') || zoneLower.includes('centru comercial')) {
        contextParts.push(`Tip zonă: Mall`);
      } else if (zoneLower.includes('bulevard') || zoneLower.includes('bd')) {
        contextParts.push(`Tip zonă: Boulevard`);
      } else if (zoneLower.includes('piață') || zoneLower.includes('piata')) {
        contextParts.push(`Tip zonă: Piață`);
      }
    }
    
    // 3. Suprafață utilă (±15% pentru filtrare)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_utila) {
      contextParts.push(`Suprafață utilă: ${attributes.surface || attributes.suprafata || attributes.suprafata_utila} mp`);
    }
    
    // 4. Tip spațiu (stradal / mall / etaj 1 / birouri) - similar pentru filtrare
    if (attributes?.type || attributes?.tip || attributes?.tip_spatiu) {
      contextParts.push(`Tip spațiu: ${attributes.type || attributes.tip || attributes.tip_spatiu}`);
    }
    
    // 5. Vitrină (da / nu, lungime)
    if (attributes?.showcase || attributes?.vitrine) {
      const hasShowcase = attributes.showcase || attributes.vitrine;
      contextParts.push(`Vitrină: ${hasShowcase ? "Da" : "Nu"}`);
      if (hasShowcase && (attributes?.showcase_length || attributes?.lungime_vitrina)) {
        contextParts.push(`Lungime vitrină: ${attributes.showcase_length || attributes.lungime_vitrina} m`);
      }
    }
    
    // Acces la stradă
    if (attributes?.street_access || attributes?.acces_strada) {
      contextParts.push(`Acces stradă: ${attributes.street_access || attributes.acces_strada ? "Da" : "Nu"}`);
    }
    
    // 6. Trafic pietonal
    if (attributes?.traffic || attributes?.trafic || attributes?.trafic_pietonal) {
      contextParts.push(`Trafic pietonal: ${attributes.traffic || attributes.trafic || attributes.trafic_pietonal}`);
    }
    
    // 7. Anul clădirii
    if (attributes?.year || attributes?.an || attributes?.anConstructie || attributes?.an_cladire) {
      contextParts.push(`An construcție clădire: ${attributes.year || attributes.an || attributes.anConstructie || attributes.an_cladire}`);
    }
    
    // 8. Stare (renovat / nerenovat)
    if (attributes?.condition || attributes?.stare || attributes?.state) {
      contextParts.push(`Stare: ${attributes.condition || attributes.stare || attributes.state}`);
    }
    if (attributes?.renovated || attributes?.renovat) {
      contextParts.push(`Renovat: ${attributes.renovated || attributes.renovat ? "Da" : "Nu"}`);
    }
    
    // Utilități și compartimentare
    if (attributes?.utilities || attributes?.utilitati) {
      contextParts.push(`Utilități: ${attributes.utilities || attributes.utilitati}`);
    }
    if (attributes?.compartimentare || attributes?.layout) {
      contextParts.push(`Compartimentare: ${attributes.compartimentare || attributes.layout}`);
    }
    
    if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
  } else if (category === "industrial" || category === "hala" || category === "hala_industriala") {
    contextParts.push(`Hală industrială: ${title}`);
    
    // 1. Zonă industrială / logistică
    if (city) contextParts.push(`Oraș: ${city}`);
    if (area) contextParts.push(`Zonă: ${area}`);
    if (attributes?.zone || attributes?.zona_industriala || attributes?.zona_logistica) {
      contextParts.push(`Zonă industrială/logistică: ${attributes.zone || attributes.zona_industriala || attributes.zona_logistica}`);
    }
    
    // 2. Suprafață hală (mp)
    if (attributes?.surface || attributes?.suprafata || attributes?.suprafata_hala) {
      contextParts.push(`Suprafață hală: ${attributes.surface || attributes.suprafata || attributes.suprafata_hala} mp`);
    }
    
    // 3. Suprafață teren
    if (attributes?.land || attributes?.teren || attributes?.suprafata_teren) {
      contextParts.push(`Suprafață teren: ${attributes.land || attributes.teren || attributes.suprafata_teren} mp`);
    }
    
    // 4. Înălțime utilă
    if (attributes?.height || attributes?.inaltime || attributes?.inaltime_utila) {
      contextParts.push(`Înălțime utilă: ${attributes.height || attributes.inaltime || attributes.inaltime_utila} m`);
    }
    
    // 5. Acces TIR, rampă
    if (attributes?.tir_access || attributes?.acces_tir) {
      contextParts.push(`Acces TIR: ${attributes.tir_access || attributes.acces_tir ? "Da" : "Nu"}`);
    }
    if (attributes?.rampa) {
      contextParts.push(`Rampă: ${attributes.rampa ? "Da" : "Nu"}`);
    }
    
    // 6. Tip construcție
    if (attributes?.construction || attributes?.constructie || attributes?.tip_constructie) {
      contextParts.push(`Tip construcție: ${attributes.construction || attributes.constructie || attributes.tip_constructie}`);
    }
    
    if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
  } else if (category === "construction_equipment" || category === "utilaje_construcții" || category === "utilaje") {
    contextParts.push(`Utilaj construcții: ${title}`);
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    
    // Model
    if (attributes?.model) {
      contextParts.push(`Model: ${attributes.model}`);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
    }
    
    // Ore de funcționare (IMPORTANT!)
    if (attributes?.hours || attributes?.ore || attributes?.ore_funcionare) {
      contextParts.push(`Ore funcționare: ${attributes.hours || attributes.ore || attributes.ore_funcionare} ore`);
    }
    
    // Tip motor / putere
    if (attributes?.engine || attributes?.motor || attributes?.power || attributes?.putere) {
      contextParts.push(`Motor/Putere: ${attributes.engine || attributes.motor || attributes.power || attributes.putere}`);
    }
    
    // Capacitatea cupei
    if (attributes?.capacity || attributes?.capacitate || attributes?.capacitate_cupa) {
      contextParts.push(`Capacitate cupă: ${attributes.capacity || attributes.capacitate || attributes.capacitate_cupa}`);
    }
    
    // Greutate operațională
    if (attributes?.weight || attributes?.greutate || attributes?.greutate_operationala) {
      contextParts.push(`Greutate operațională: ${attributes.weight || attributes.greutate || attributes.greutate_operationala}`);
    }
    
    // Stare tehnică
    if (attributes?.condition || attributes?.stare || attributes?.stare_tehnica) {
      contextParts.push(`Stare tehnică: ${attributes.condition || attributes.stare || attributes.stare_tehnica}`);
    }
    
    // Revizii / service
    if (attributes?.service || attributes?.revizii || attributes?.maintenance) {
      contextParts.push(`Revizii/Service: ${attributes.service || attributes.revizii || attributes.maintenance}`);
    }
    
    // Echipare
    if (attributes?.equipment || attributes?.echipare) {
      const equipment = attributes.equipment || attributes.echipare;
      if (typeof equipment === 'string') {
        contextParts.push(`Echipare: ${equipment}`);
      } else if (Array.isArray(equipment)) {
        contextParts.push(`Echipare: ${equipment.join(", ")}`);
      }
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "agricultural_equipment" || category === "utilaje_agricole") {
    contextParts.push(`Utilaj agricol: ${title}`);
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    
    // Model
    if (attributes?.model) {
      contextParts.push(`Model: ${attributes.model}`);
    }
    
    // HP (putere motor)
    if (attributes?.hp || attributes?.power || attributes?.putere || attributes?.cp) {
      contextParts.push(`Putere (HP): ${attributes.hp || attributes.power || attributes.putere || attributes.cp} CP`);
    }
    
    // Ore de funcționare
    if (attributes?.hours || attributes?.ore || attributes?.ore_funcionare) {
      contextParts.push(`Ore funcționare: ${attributes.hours || attributes.ore || attributes.ore_funcionare} ore`);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
    }
    
    // Stare anvelope
    if (attributes?.tires || attributes?.anvelope || attributes?.stare_anvelope) {
      contextParts.push(`Stare anvelope: ${attributes.tires || attributes.anvelope || attributes.stare_anvelope}`);
    }
    
    // Echipare
    if (attributes?.equipment || attributes?.echipare) {
      const equipment = attributes.equipment || attributes.echipare;
      if (typeof equipment === 'string') {
        contextParts.push(`Echipare: ${equipment}`);
      } else if (Array.isArray(equipment)) {
        contextParts.push(`Echipare: ${equipment.join(", ")}`);
      }
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "forestry_equipment" || category === "echipamente_forestiere") {
    contextParts.push(`Echipament forestier: ${title}`);
    
    // Marca / model
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    if (attributes?.model) {
      contextParts.push(`Model: ${attributes.model}`);
    }
    
    // Capacitate / putere
    if (attributes?.capacity || attributes?.capacitate || attributes?.power || attributes?.putere) {
      contextParts.push(`Capacitate/Putere: ${attributes.capacity || attributes.capacitate || attributes.power || attributes.putere}`);
    }
    
    // Ore de lucru
    if (attributes?.hours || attributes?.ore) {
      contextParts.push(`Ore lucru: ${attributes.hours || attributes.ore} ore`);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
    }
    
    // Stare tehnică
    if (attributes?.condition || attributes?.stare || attributes?.stare_tehnica) {
      contextParts.push(`Stare tehnică: ${attributes.condition || attributes.stare || attributes.stare_tehnica}`);
    }
    
    // Echipare forestieră
    if (attributes?.equipment || attributes?.echipare) {
      contextParts.push(`Echipare: ${attributes.equipment || attributes.echipare}`);
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "generators" || category === "compressors" || category === "generatoare" || category === "compresoare") {
    contextParts.push(`Generator/Compresor: ${title}`);
    
    // Tip (diesel / benzină)
    if (attributes?.type || attributes?.tip || attributes?.fuel || attributes?.combustibil) {
      contextParts.push(`Tip: ${attributes.type || attributes.tip || attributes.fuel || attributes.combustibil}`);
    }
    
    // Putere kVA
    if (attributes?.power || attributes?.putere || attributes?.kva) {
      contextParts.push(`Putere: ${attributes.power || attributes.putere || attributes.kva} kVA`);
    }
    
    // Ore funcționare
    if (attributes?.hours || attributes?.ore) {
      contextParts.push(`Ore funcționare: ${attributes.hours || attributes.ore} ore`);
    }
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    
    // Anul
    if (attributes?.year || attributes?.an) {
      contextParts.push(`An: ${attributes.year || attributes.an}`);
    }
    
    // Nivel zgomot
    if (attributes?.noise || attributes?.zgomot) {
      contextParts.push(`Nivel zgomot: ${attributes.noise || attributes.zgomot}`);
    }
    
    // Stare
    if (attributes?.condition || attributes?.stare) {
      contextParts.push(`Stare: ${attributes.condition || attributes.stare}`);
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "professional_tools" || category === "scule_profesionale") {
    contextParts.push(`Scule profesionale: ${title}`);
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    
    // Model
    if (attributes?.model) {
      contextParts.push(`Model: ${attributes.model}`);
    }
    
    // Putere (W) / specificații tehnice
    if (attributes?.power || attributes?.putere || attributes?.watt) {
      contextParts.push(`Putere: ${attributes.power || attributes.putere || attributes.watt}W`);
    }
    if (attributes?.specs || attributes?.specificatii) {
      contextParts.push(`Specificații: ${attributes.specs || attributes.specificatii}`);
    }
    
    // Nou / utilizat
    if (attributes?.condition || attributes?.stare || attributes?.new || attributes?.nou) {
      contextParts.push(`Stare: ${attributes.condition || attributes.stare || (attributes.new || attributes.nou ? "Nou" : "Uzat")}`);
    }
    
    // Accesorii incluse
    if (attributes?.accessories || attributes?.accesorii) {
      const accessories = attributes.accessories || attributes.accesorii;
      if (typeof accessories === 'string') {
        contextParts.push(`Accesorii: ${accessories}`);
      } else if (Array.isArray(accessories)) {
        contextParts.push(`Accesorii: ${accessories.join(", ")}`);
      }
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "auto_workshop" || category === "echipamente_atelier_auto") {
    contextParts.push(`Echipament atelier auto: ${title}`);
    
    // Tip
    if (attributes?.type || attributes?.tip) {
      contextParts.push(`Tip: ${attributes.type || attributes.tip}`);
    }
    
    // Tonaj (2T/4T)
    if (attributes?.tonnage || attributes?.tonaj) {
      contextParts.push(`Tonaj: ${attributes.tonnage || attributes.tonaj}T`);
    }
    
    // Marca
    if (attributes?.brand || attributes?.marca) {
      contextParts.push(`Brand: ${attributes.brand || attributes.marca}`);
    }
    
    // Stare
    if (attributes?.condition || attributes?.stare) {
      contextParts.push(`Stare: ${attributes.condition || attributes.stare}`);
    }
    
    // An fabricație
    if (attributes?.year || attributes?.an) {
      contextParts.push(`An fabricație: ${attributes.year || attributes.an}`);
    }
    
    if (city) contextParts.push(`Locație: ${city}`);
  } else if (category === "electronics") {
    contextParts.push(`Produs: ${title}`);
    if (attributes?.brand) contextParts.push(`Brand: ${attributes.brand}`);
    if (attributes?.model) contextParts.push(`Model: ${attributes.model}`);
    if (attributes?.year) contextParts.push(`An lansare: ${attributes.year}`);
    if (attributes?.condition) contextParts.push(`Stare: ${attributes.condition}`);
  } else if (category === "fashion") {
    contextParts.push(`Produs: ${title}`);
    if (attributes?.brand) contextParts.push(`Brand: ${attributes.brand}`);
    if (attributes?.condition) contextParts.push(`Stare: ${attributes.condition}`);
    if (attributes?.size) contextParts.push(`Mărime: ${attributes.size}`);
  } else {
    contextParts.push(`Produs: ${title}`);
    if (description) contextParts.push(`Descriere: ${description.substring(0, 200)}`);
    if (city) contextParts.push(`Locație: ${city}`);
  }

  return contextParts.join("\n");
}




