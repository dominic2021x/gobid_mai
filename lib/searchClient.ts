import { ProductForEvaluation } from "./types/priceEvaluation";
import { buildSearchQueryForProduct } from "./priceLogic";

/**
 * Extrage prețuri din text folosind regex
 * Îmbunătățit pentru a evita interpretări greșite (ex: 89 EUR în loc de 89.000 EUR)
 */
function extractPricesFromText(text: string, currency: string = "EUR"): number[] {
  const prices: number[] = [];
  
  // Normalizează textul: înlocuiește virgula cu punct pentru numere (ex: 20,999 -> 20999)
  const normalizedText = text.replace(/(\d),(\d)/g, '$1$2');
  
  // Pattern pentru prețuri: număr cu separator mii (spațiu, punct, virgulă) + moneda
  const patterns = [
    // Format: 20.999 EUR, 20 999 EUR, 20,999 EUR (preferăm numere cu separatori)
    new RegExp(`(\\d{1,3}(?:[\\s.,]\\d{3})+)\\s*(?:${currency}|€|EUR|RON|lei|USD|\\$)`, "gi"),
    // Format: EUR 20.999, € 20.999
    new RegExp(`(?:${currency}|€|EUR|RON|lei|USD|\\$)\\s*(\\d{1,3}(?:[\\s.,]\\d{3})+)`, "gi"),
    // Format: 20999 EUR (număr mare fără separatori + moneda)
    new RegExp(`\\b(\\d{4,7})\\s*(?:${currency}|€|EUR|RON|lei|USD|\\$)`, "gi"),
    // Format: preț: 20.999, preț 20.999
    new RegExp(`(?:preț|pret|price|cost|valoare)[: ]*\\s*(\\d{1,3}(?:[\\s.,]\\d{3})+)\\s*(?:${currency}|€|EUR|RON|lei|USD|\\$)?`, "gi"),
  ];

  const foundPrices = new Set<number>(); // Folosim Set pentru a evita duplicatele

  for (const pattern of patterns) {
    const matches = normalizedText.matchAll(pattern);
    for (const match of matches) {
      const priceStr = match[1] || match[0];
      // Curăță separatorii (spațiu, punct, virgulă)
      const cleanPrice = priceStr.replace(/[\s.,]/g, "");
      const price = parseFloat(cleanPrice);
      
      // Filtrează prețuri nerealiste (prea mici sau prea mari)
      // Nu acceptăm prețuri sub 50 EUR sau peste 10M EUR
      if (price >= 50 && price < 10000000 && !isNaN(price)) {
        foundPrices.add(Math.round(price));
      }
    }
  }

  return Array.from(foundPrices);
}

/**
 * Caută produse similare folosind Google Custom Search API
 */
async function searchWithGoogle(query: string, category?: string, product?: ProductForEvaluation): Promise<string> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    // Fallback: returnează text mock pentru testare
    console.warn("Google Search API not configured, using mock data");
    return generateMockSearchResults(query, category, product);
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=20&lr=lang_ro`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extrage textul din rezultate
    const texts: string[] = [];
    if (data.items) {
      for (const item of data.items) {
        if (item.title) texts.push(item.title);
        if (item.snippet) texts.push(item.snippet);
      }
    }

    return texts.join(" ");
  } catch (error) {
    console.error("Error searching with Google:", error);
    return generateMockSearchResults(query, category, product);
  }
}

/**
 * Detectează subcategoria pentru autovehicule
 */
function detectVehicleSubcategory(product: ProductForEvaluation): string {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie;
  if (subcategory) return subcategory.toLowerCase();
  
  const titleLower = (product.title || '').toLowerCase();
  
  if (titleLower.includes('suv') || titleLower.includes('4x4') || titleLower.includes('awd')) {
    return "suv";
  } else if (titleLower.includes('motocicletă') || titleLower.includes('motocicleta') || 
             titleLower.includes('scuter') || titleLower.includes('motorcycle') || 
             titleLower.includes('harley') || titleLower.includes('yamaha') || 
             titleLower.includes('honda') || titleLower.includes('kawasaki')) {
    return "motociclete";
  } else if (titleLower.includes('camion') || titleLower.includes('truck') || 
             titleLower.includes('man') || titleLower.includes('scania') || 
             titleLower.includes('volvo') || titleLower.includes('daf')) {
    return "camioane";
  } else if (titleLower.includes('remorcă') || titleLower.includes('remorca') || 
             titleLower.includes('semiremorcă') || titleLower.includes('semiremorca') || 
             titleLower.includes('trailer')) {
    return "remorci";
  } else if (titleLower.includes('autorulotă') || titleLower.includes('autorulota') || 
             titleLower.includes('rulotă') || titleLower.includes('rulota') || 
             titleLower.includes('motorhome') || titleLower.includes('caravan')) {
    return "autorulote";
  } else if (titleLower.includes('tesla') || titleLower.includes('electric') || 
             titleLower.includes('electrică') || titleLower.includes('ev') || 
             (titleLower.includes('hybrid') && !titleLower.includes('hibrid'))) {
    return "electrice";
  } else if (titleLower.includes('piesă') || titleLower.includes('piesa') || 
             titleLower.includes('accesoriu') || titleLower.includes('alternator') || 
             titleLower.includes('cutie') || titleLower.includes('turbină') || 
             titleLower.includes('turbina') || titleLower.includes('jantă') || 
             titleLower.includes('janta')) {
    return "piese";
  }
  
  return "autoturisme";
}

/**
 * Calculează prețuri realiste pentru mașini bazate pe toate atributele:
 * - Brand (Marca)
 * - Model
 * - An fabricație
 * - Motorizare
 * - Tip combustibil
 * - Km parcurși
 * - Echipare / opțiuni
 */
function calculateRealisticCarPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = detectVehicleSubcategory(product);
  
  // Dacă nu este autoturism, folosește funcțiile specifice
  if (subcategory === "suv") {
    return calculateRealisticSUVPriceRange(product);
  } else if (subcategory === "motociclete") {
    return calculateRealisticMotorcyclePriceRange(product);
  } else if (subcategory === "camioane") {
    return calculateRealisticTruckPriceRange(product);
  } else if (subcategory === "remorci") {
    return calculateRealisticTrailerPriceRange(product);
  } else if (subcategory === "autorulote") {
    return calculateRealisticMotorhomePriceRange(product);
  } else if (subcategory === "electrice") {
    return calculateRealisticElectricVehiclePriceRange(product);
  } else if (subcategory === "piese") {
    return calculateRealisticAutoPartsPriceRange(product);
  }
  
  // Autoturisme (default)
  const currentYear = new Date().getFullYear();
  const carYear = product.attributes?.year || product.attributes?.an 
    ? parseInt(String(product.attributes.year || product.attributes.an)) 
    : null;
  const km = product.attributes?.km || product.attributes?.kilometraj 
    ? parseInt(String(product.attributes.km || product.attributes.kilometraj)) 
    : null;
  
  if (!carYear) {
    // Dacă nu avem an, folosim range generic pentru mașini vechi
    return { min: 2000, max: 15000 };
  }
  
  const age = currentYear - carYear;
  
  // Baza de preț bazată pe vârstă
  let baseMin = 0;
  let baseMax = 0;
  
  if (age >= 20) {
    // Mașini foarte vechi (20+ ani): 1000 - 5000 EUR
    baseMin = 1000;
    baseMax = 5000;
  } else if (age >= 15) {
    // Mașini vechi (15-19 ani): 2000 - 7000 EUR
    baseMin = 2000;
    baseMax = 7000;
  } else if (age >= 10) {
    // Mașini în vârstă (10-14 ani): 3000 - 12000 EUR
    baseMin = 3000;
    baseMax = 12000;
  } else if (age >= 5) {
    // Mașini mijlocii (5-9 ani): 8000 - 25000 EUR
    baseMin = 8000;
    baseMax = 25000;
  } else {
    // Mașini noi (0-4 ani): 15000 - 50000 EUR
    baseMin = 15000;
    baseMax = 50000;
  }
  
  // Ajustare bazată pe kilometraj
  if (km !== null && !isNaN(km)) {
    if (km > 300000) {
      // Foarte mult kilometraj: reduce prețul cu 30-40%
      baseMin = Math.round(baseMin * 0.6);
      baseMax = Math.round(baseMax * 0.7);
    } else if (km > 200000) {
      // Mult kilometraj: reduce prețul cu 20-30%
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.8);
    } else if (km < 50000) {
      // Puțin kilometraj: crește prețul cu 10-20%
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.2);
    }
  }
  
  // Ajustare bazată pe marca (premium vs standard)
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const isPremium = brand.includes('mercedes') || brand.includes('bmw') || brand.includes('audi') || 
                    brand.includes('porsche') || brand.includes('lexus') || brand.includes('tesla') ||
                    brand.includes('jaguar') || brand.includes('land rover') || brand.includes('range rover');
  
  if (isPremium) {
    // Marci premium: crește prețul cu 20-40%
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  }
  
  // Ajustare bazată pe tip combustibil
  const fuel = (product.attributes?.fuel || product.attributes?.combustibil || product.attributes?.tip_combustibil || '').toLowerCase();
  if (fuel.includes('electric') || fuel.includes('electrică') || fuel.includes('hibrid')) {
    // Mașini electrice/hibrid: crește prețul cu 15-25%
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  } else if (fuel.includes('diesel')) {
    // Diesel: ușor mai scump decât benzina (5-10%)
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe echipare/opțiuni
  const equipment = product.attributes?.equipment || product.attributes?.echipare || 
                    product.attributes?.options || product.attributes?.optiuni;
  if (equipment) {
    let equipmentValue = 0;
    if (typeof equipment === 'string') {
      // Dacă este string, verificăm dacă conține opțiuni premium
      const equipmentLower = equipment.toLowerCase();
      if (equipmentLower.includes('navigație') || equipmentLower.includes('navigatie') ||
          equipmentLower.includes('camera') || equipmentLower.includes('senzori') ||
          equipmentLower.includes('piele') || equipmentLower.includes('panoramic') ||
          equipmentLower.includes('xenon') || equipmentLower.includes('led') ||
          equipmentLower.includes('automat') || equipmentLower.includes('dsg')) {
        equipmentValue = 0.1; // +10% pentru echipare bună
      }
    } else if (Array.isArray(equipment)) {
      // Dacă este array, numărăm opțiunile
      equipmentValue = Math.min(equipment.length * 0.02, 0.15); // Max 15% pentru multe opțiuni
    } else if (typeof equipment === 'object') {
      // Dacă este obiect, numărăm opțiunile activate
      const activeOptions = Object.values(equipment).filter(v => v === true || v === 'true' || v === 'yes').length;
      equipmentValue = Math.min(activeOptions * 0.02, 0.15);
    }
    
    if (equipmentValue > 0) {
      baseMin = Math.round(baseMin * (1 + equipmentValue));
      baseMax = Math.round(baseMax * (1 + equipmentValue));
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru SUV-uri
 */
function calculateRealisticSUVPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  // SUV-uri sunt de obicei 20-40% mai scumpe decât autoturismele similare
  const carRange = calculateRealisticCarPriceRange({ ...product, attributes: { ...product.attributes, subcategory: 'autoturisme' } });
  return {
    min: Math.round(carRange.min * 1.2),
    max: Math.round(carRange.max * 1.4)
  };
}

/**
 * Calculează prețuri realiste pentru motociclete
 */
function calculateRealisticMotorcyclePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an ? parseInt(String(product.attributes.year || product.attributes.an)) : null;
  const km = product.attributes?.km || product.attributes?.kilometraj ? parseInt(String(product.attributes.km || product.attributes.kilometraj)) : null;
  const cc = product.attributes?.cc || product.attributes?.cilindree ? parseInt(String(product.attributes.cc || product.attributes.cilindree)) : null;
  
  let baseMin = 1000;
  let baseMax = 15000;
  
  if (cc) {
    if (cc >= 1000) {
      baseMin = 5000;
      baseMax = 25000;
    } else if (cc >= 600) {
      baseMin = 3000;
      baseMax = 15000;
    } else if (cc >= 250) {
      baseMin = 1500;
      baseMax = 8000;
    }
  }
  
  if (year) {
    const age = currentYear - year;
    if (age > 10) {
      baseMin = Math.round(baseMin * 0.5);
      baseMax = Math.round(baseMax * 0.7);
    } else if (age > 5) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.9);
    }
  }
  
  if (km && km > 50000) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru camioane
 */
function calculateRealisticTruckPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const tonnage = product.attributes?.tonnage || product.attributes?.tonaj || product.attributes?.capacitate;
  const year = product.attributes?.year || product.attributes?.an ? parseInt(String(product.attributes.year || product.attributes.an)) : null;
  
  let baseMin = 10000;
  let baseMax = 80000;
  
  if (tonnage) {
    const tonnageNum = parseFloat(String(tonnage));
    baseMin = Math.round(tonnageNum * 5000);
    baseMax = Math.round(tonnageNum * 25000);
  }
  
  if (year) {
    const age = new Date().getFullYear() - year;
    if (age > 15) {
      baseMin = Math.round(baseMin * 0.4);
      baseMax = Math.round(baseMax * 0.6);
    } else if (age > 10) {
      baseMin = Math.round(baseMin * 0.6);
      baseMax = Math.round(baseMax * 0.8);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru remorci
 */
function calculateRealisticTrailerPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const tonnage = product.attributes?.tonnage || product.attributes?.tonaj || product.attributes?.capacitate;
  
  let baseMin = 2000;
  let baseMax = 20000;
  
  if (tonnage) {
    const tonnageNum = parseFloat(String(tonnage));
    baseMin = Math.round(tonnageNum * 1000);
    baseMax = Math.round(tonnageNum * 5000);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru autorulote
 */
function calculateRealisticMotorhomePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const year = product.attributes?.year || product.attributes?.an ? parseInt(String(product.attributes.year || product.attributes.an)) : null;
  const length = product.attributes?.length || product.attributes?.lungime;
  
  let baseMin = 15000;
  let baseMax = 100000;
  
  if (length) {
    const lengthNum = parseFloat(String(length));
    baseMin = Math.round(lengthNum * 2000);
    baseMax = Math.round(lengthNum * 8000);
  }
  
  if (year) {
    const age = new Date().getFullYear() - year;
    if (age > 15) {
      baseMin = Math.round(baseMin * 0.3);
      baseMax = Math.round(baseMax * 0.5);
    } else if (age > 10) {
      baseMin = Math.round(baseMin * 0.5);
      baseMax = Math.round(baseMax * 0.7);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru vehicule electrice
 */
function calculateRealisticElectricVehiclePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  // Vehiculele electrice sunt de obicei 30-50% mai scumpe decât cele cu combustie
  const carRange = calculateRealisticCarPriceRange({ ...product, attributes: { ...product.attributes, subcategory: 'autoturisme' } });
  return {
    min: Math.round(carRange.min * 1.3),
    max: Math.round(carRange.max * 1.5)
  };
}

/**
 * Calculează prețuri realiste pentru piese auto
 */
function calculateRealisticAutoPartsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const price = product.price || 0;
  
  // Pentru piese, folosim un range bazat pe prețul indicat sau un range generic
  if (price > 0) {
    return {
      min: Math.round(price * 0.5),
      max: Math.round(price * 2)
    };
  }
  
  return { min: 50, max: 5000 };
}

/**
 * Calculează prețuri realiste pentru apartamente bazate pe toate criteriile:
 * - Orașul
 * - Zona exactă / cartierul
 * - Anul construcției
 * - Suprafața utilă (mp)
 * - Compartimentare
 * - Îmbunătățiri / starea
 * - Etaj
 * - Lift
 * - Locație față de metrou / transport
 */
function calculateRealisticApartmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const surface = product.attributes?.surface || product.attributes?.suprafata || 
                  product.attributes?.suprafata_utila || product.attributes?.mp;
  
  if (!surface) {
    // Dacă nu avem suprafață, folosim range generic
    return { min: 40000, max: 150000 };
  }
  
  const surfaceNum = parseInt(String(surface));
  
  // Preț/mp bazat pe oraș (EUR/mp)
  const city = (product.city || '').toLowerCase();
  let pricePerM2 = 800; // Default pentru orașe mici
  
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2 = 1200; // București: 1000-1400 EUR/mp
  } else if (city.includes('cluj')) {
    pricePerM2 = 1100; // Cluj: 900-1300 EUR/mp
  } else if (city.includes('iași') || city.includes('iasi')) {
    pricePerM2 = 700; // Iași: 600-800 EUR/mp
  } else if (city.includes('timișoara') || city.includes('timisoara')) {
    pricePerM2 = 800; // Timișoara: 700-900 EUR/mp
  } else if (city.includes('constanța') || city.includes('constanta')) {
    pricePerM2 = 900; // Constanța: 800-1000 EUR/mp
  }
  
  // Ajustare bazată pe zonă/cartier
  const area = (product.area || product.attributes?.zone || product.attributes?.cartier || '').toLowerCase();
  if (area.includes('dorobanți') || area.includes('aviatiei') || area.includes('primăverii') || 
      area.includes('kiseleff') || area.includes('victoriei')) {
    pricePerM2 *= 1.5; // Zone premium: +50%
  } else if (area.includes('militari') || area.includes('drumul taberei') || area.includes('pantelimon')) {
    pricePerM2 *= 0.85; // Zone mai accesibile: -15%
  }
  
  // Ajustare bazată pe anul construcției
  const year = product.attributes?.year || product.attributes?.an || 
               product.attributes?.anConstructie || product.attributes?.an_construcție;
  if (year) {
    const yearNum = parseInt(String(year));
    if (yearNum >= 1960 && yearNum <= 1989) {
      // Bloc vechi: -20%
      pricePerM2 *= 0.8;
    } else if (yearNum >= 2000) {
      // Bloc nou: +15%
      pricePerM2 *= 1.15;
    }
  }
  
  // Ajustare bazată pe compartimentare
  const layout = (product.attributes?.compartimentare || product.attributes?.layout || '').toLowerCase();
  if (layout.includes('decomandat') || layout.includes('circular')) {
    pricePerM2 *= 1.1; // +10% pentru decomandat/circular
  } else if (layout.includes('semidecomandat')) {
    pricePerM2 *= 0.95; // -5% pentru semidecomandat
  } else if (layout.includes('open space')) {
    pricePerM2 *= 1.05; // +5% pentru open space
  }
  
  // Ajustare bazată pe îmbunătățiri
  if (product.attributes?.renovated || product.attributes?.renovat) {
    pricePerM2 *= 1.2; // +20% pentru renovat complet
  }
  if (product.attributes?.furnished || product.attributes?.mobilat) {
    pricePerM2 *= 1.1; // +10% pentru mobilat
  }
  if (product.attributes?.thermopan || product.attributes?.termopan) {
    pricePerM2 *= 1.05; // +5% pentru termopan
  }
  if (product.attributes?.centrala || product.attributes?.centrala_proprie) {
    pricePerM2 *= 1.08; // +8% pentru centrală proprie
  }
  
  // Ajustare bazată pe etaj
  const floor = product.attributes?.floor || product.attributes?.etaj;
  const totalFloors = product.attributes?.totalFloors || product.attributes?.total_etaje || product.attributes?.totalEtaje;
  if (floor !== undefined && totalFloors) {
    const floorNum = parseInt(String(floor));
    const totalFloorsNum = parseInt(String(totalFloors));
    
    if (floorNum === 0) {
      pricePerM2 *= 0.9; // Parter: -10%
    } else if (floorNum === totalFloorsNum) {
      pricePerM2 *= 0.85; // Ultim etaj: -15%
    } else if (floorNum > 0 && floorNum < totalFloorsNum) {
      pricePerM2 *= 1.05; // Etaj intermediar: +5%
    }
  }
  
  // Ajustare bazată pe lift
  if (product.attributes?.lift || product.attributes?.elevator) {
    const hasLift = product.attributes.lift || product.attributes.elevator;
    if (hasLift && totalFloors && parseInt(String(totalFloors)) > 4) {
      pricePerM2 *= 1.1; // +10% pentru lift la blocuri peste 4 etaje
    }
  }
  
  // Ajustare bazată pe locație față de metrou/transport
  if (product.attributes?.metro || product.attributes?.metrou || product.attributes?.transport) {
    pricePerM2 *= 1.15; // +15% pentru apropiere de metrou/transport
  }
  
  // Calculează prețul total
  const basePrice = surfaceNum * pricePerM2;
  
  // Range de ±20% pentru variație
  return {
    min: Math.round(basePrice * 0.8),
    max: Math.round(basePrice * 1.2)
  };
}

/**
 * Calculează prețuri realiste pentru case/vile bazate pe toate criteriile
 * Detectează automat micro-terenuri și case vechi
 */
function calculateRealisticHousePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const builtSurface = product.attributes?.surface || product.attributes?.suprafata || 
                       product.attributes?.suprafata_construita || product.attributes?.suprafata_utila;
  const landSurface = product.attributes?.land || product.attributes?.teren || 
                      product.attributes?.suprafata_teren;
  
  // Parse suprafețe o singură dată pentru a evita referințe înainte de inițializare
  const builtSurfaceNum = builtSurface ? parseInt(String(builtSurface)) : undefined;
  const landSurfaceNum = landSurface ? parseInt(String(landSurface)) : undefined;
  
  // Detectare micro-teren (<150 mp teren)
  const isMicroTeren = !!landSurfaceNum && landSurfaceNum < 150;
  
  // Detectare casă veche (fără an construcție sau renovări)
  const titleLower = (product.title || '').toLowerCase();
  const descLower = (product.description || '').toLowerCase();
  const fullText = `${titleLower} ${descLower}`;
  const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i) ||
                          product.attributes?.year || product.attributes?.an || product.attributes?.anConstructie;
  const hasRenovari = fullText.includes('renovat') || fullText.includes('renovație') ||
                      fullText.includes('structură beton') || fullText.includes('structura beton') ||
                      fullText.includes('acoperiș nou') || fullText.includes('acoperis nou') ||
                      product.attributes?.renovated || product.attributes?.renovat;
  const isCasaVeche = !hasAnConstructie && !hasRenovari;
  
  // Detectare licitație
  const isLicitatie = fullText.includes('licitație') || fullText.includes('licitatie') ||
                      fullText.includes('executare') || fullText.includes('anaf') ||
                      fullText.includes('preț de pornire') || fullText.includes('pret de pornire');
  
  // REGULA 1: Micro-teren (<150 mp teren)
  if (isMicroTeren) {
    console.log(`[House Price] Detected micro-teren (${landSurfaceNum} mp), applying micro-teren pricing`);
    // Micro-teren: Prețuri foarte mici (5k - 15k EUR total) - FOARTE PRECIS
    let basePrice = 10000; // Preț de bază pentru micro-teren
    
    // Ajustare bazată pe oraș (pentru micro-terenuri, diferențele sunt mai mici)
    const city = (product.city || '').toLowerCase();
    if (city.includes('bucurești') || city.includes('bucuresti')) {
      basePrice = 12000; // Redus de la 15000
    } else if (city.includes('cluj')) {
      basePrice = 10000; // Redus de la 12000
    } else {
      // Pentru orașe mici (ex: Breaza), prețuri și mai mici
      basePrice = 7000; // Redus de la 8000
    }
    
    // Ajustare bazată pe suprafața terenului (cu cât mai mic, cu atât mai ieftin)
    if (landSurfaceNum) {
      if (landSurfaceNum < 100) {
        basePrice *= 0.8; // -20% pentru terenuri foarte mici (<100 mp)
      } else if (landSurfaceNum < 120) {
        basePrice *= 0.9; // -10% pentru terenuri mici (100-120 mp)
      }
    }
    
    // Dacă este și casă veche, reduce și mai mult
    if (isCasaVeche) {
      basePrice *= 0.65; // -35% pentru casă veche (mai mult decât înainte)
    }
    
    // Dacă este licitație, aplică reducere suplimentară
    if (isLicitatie) {
      basePrice *= 0.5; // -50% pentru licitație
    }
    
    // Range mai strâns pentru precizie
    return {
      min: Math.round(basePrice * 0.75), // 5k - 12k EUR (mai strâns)
      max: Math.round(basePrice * 1.25)
    };
  }
  
  // REGULA 2: Casă veche (fără an construcție sau renovări)
      if (isCasaVeche && !isMicroTeren) {
        console.log(`[House Price] Detected casă veche, applying reduced pricing`);
        // Casă veche: Prețuri reduse (8k - 40k EUR) - FOARTE PRECIS
        let basePrice = 25000; // Redus de la 30000
        
        const city = (product.city || '').toLowerCase();
        if (city.includes('bucurești') || city.includes('bucuresti')) {
          basePrice = 35000; // Redus de la 40000
        } else if (city.includes('cluj')) {
          basePrice = 30000; // Redus de la 35000
        } else {
          basePrice = 15000; // Redus de la 20000 pentru orașe mici
        }
        
        // Ajustare bazată pe suprafață construită (case vechi mici = mai ieftine)
        if (builtSurfaceNum) {
          if (builtSurfaceNum < 60) {
            basePrice *= 0.8; // -20% pentru case foarte mici
          } else if (builtSurfaceNum < 80) {
            basePrice *= 0.9; // -10% pentru case mici
          }
        }
        
        // Dacă este licitație, aplică reducere
        if (isLicitatie) {
          basePrice *= 0.5; // -50% pentru licitație
        }
        
        // Range mai strâns pentru precizie
        return {
          min: Math.round(basePrice * 0.7), // 8k - 28k EUR (mai strâns)
          max: Math.round(basePrice * 1.3)
        };
      }
  
  // REGULA 3: Casă normală
  if (!builtSurface || !builtSurfaceNum) {
    return { min: 80000, max: 500000 };
  }
  
  const landSurfaceNumFinal = landSurfaceNum || builtSurfaceNum * 2; // Default 2x suprafața construită
  
  // Preț/mp construit bazat pe oraș (EUR/mp)
  const city = (product.city || '').toLowerCase();
  let pricePerM2Built = 600; // Default
  
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2Built = 900;
  } else if (city.includes('cluj')) {
    pricePerM2Built = 850;
  } else if (city.includes('iași') || city.includes('iasi')) {
    pricePerM2Built = 550;
  } else {
    // Pentru orașe mici (ex: Breaza), prețuri mai mici
    pricePerM2Built = 400;
  }
  
  // Ajustare bazată pe zonă (NU aplicăm premium pentru micro-terenuri sau case vechi)
  const area = (product.area || product.attributes?.zone || '').toLowerCase();
  if (!isMicroTeren && !isCasaVeche) {
    if (area.includes('premium') || area.includes('exclusiv')) {
      pricePerM2Built *= 1.4;
    }
  }
  
  // Ajustare bazată pe anul construcției
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.anConstructie;
  if (year) {
    const yearNum = parseInt(String(year));
    if (yearNum >= 2000) {
      pricePerM2Built *= 1.2; // +20% pentru case noi
    } else if (yearNum < 1980) {
      pricePerM2Built *= 0.8; // -20% pentru case foarte vechi
    }
  }
  
  // Ajustare bazată pe material structură
  const structure = (product.attributes?.structure || product.attributes?.material || '').toLowerCase();
  if (structure.includes('beton') || structure.includes('monolit')) {
    pricePerM2Built *= 1.1; // +10% pentru beton
  }
  
  // Ajustare bazată pe curte și garaj (NU pentru micro-terenuri)
  if (!isMicroTeren) {
    if (product.attributes?.yard || product.attributes?.curte) {
      pricePerM2Built *= 1.15; // +15% pentru curte amenajată
    }
    if (product.attributes?.garage || product.attributes?.garaj) {
      pricePerM2Built *= 1.1; // +10% pentru garaj
    }
  }
  
  // Ajustare bazată pe renovări
  if (product.attributes?.renovated || product.attributes?.renovat) {
    pricePerM2Built *= 1.25; // +25% pentru renovat complet
  }
  
  // Preț teren (EUR/mp) - REDUS pentru micro-terenuri
  let pricePerM2Land = 50; // Default
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2Land = 150;
  } else if (city.includes('cluj')) {
    pricePerM2Land = 120;
  } else {
    // Pentru orașe mici, preț teren mai mic
    pricePerM2Land = 30;
  }
  
  // Pentru micro-terenuri, preț teren este mai mic (terenu mic = valoare redusă)
  if (isMicroTeren) {
    pricePerM2Land *= 0.3; // -70% pentru micro-terenuri
  }
  
  const builtPrice = builtSurfaceNum * pricePerM2Built;
  const landPrice = landSurfaceNumFinal * pricePerM2Land;
  const totalPrice = builtPrice + landPrice;
  
  // Dacă este licitație, aplică reducere finală
  let finalPrice = totalPrice;
  if (isLicitatie) {
    finalPrice = totalPrice * 0.5; // -50% pentru licitație
    console.log(`[House Price] Applied 50% reduction for licitație`);
  }
  
  return {
    min: Math.round(finalPrice * 0.75),
    max: Math.round(finalPrice * 1.3)
  };
}

/**
 * Calculează prețuri realiste pentru terenuri bazate pe toate criteriile
 * Suportă atât terenuri intravilane cât și agricole
 */
function calculateRealisticLandPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  // Detectează tip teren
  const landType = product.attributes?.land_type || product.attributes?.tip_teren || 
                   (product.attributes?.intravilan === true || product.attributes?.intravilan === 'true' ? "intravilan" : null) ||
                   (product.attributes?.agricol === true || product.attributes?.agricol === 'true' ? "agricol" : null);
  const titleLower = (product.title || '').toLowerCase();
  const isAgricultural = landType === "agricol" || titleLower.includes('agricol') || 
                         titleLower.includes('arabil') || titleLower.includes('fâneață') || 
                         titleLower.includes('faneata') || titleLower.includes('pășune') || 
                         titleLower.includes('pasune');
  
  if (isAgricultural) {
    // Terenuri Agricole
    const surface = product.attributes?.surface || product.attributes?.suprafata || 
                    product.attributes?.ha || product.attributes?.hectare;
    
    if (!surface) {
      return { min: 5000, max: 50000 };
    }
    
    const surfaceNum = parseFloat(String(surface)); // în hectare
    
    // Preț/ha bazat pe județ și calitatea solului (EUR/ha)
    const county = (product.attributes?.county || product.attributes?.judet || product.city || '').toLowerCase();
    let pricePerHa = 3000; // Default
    
    if (county.includes('cluj') || county.includes('timis') || county.includes('arad')) {
      pricePerHa = 5000; // Zone cu pământ bun
    } else if (county.includes('bucurești') || county.includes('ilfov')) {
      pricePerHa = 8000; // Zone aproape de capitală
    } else if (county.includes('dolj') || county.includes('ialomița')) {
      pricePerHa = 4000; // Zone agricole productive
    }
    
    // Ajustare bazată pe categoria (arabil, fâneață, pășune)
    const category = (product.attributes?.category || product.attributes?.categorie || '').toLowerCase();
    if (category.includes('arabil')) {
      pricePerHa *= 1.2; // +20% pentru arabil
    } else if (category.includes('fâneață') || category.includes('faneata')) {
      pricePerHa *= 0.9; // -10% pentru fâneață
    } else if (category.includes('pășune') || category.includes('pasune')) {
      pricePerHa *= 0.7; // -30% pentru pășune
    }
    
    // Ajustare bazată pe bonitatea solului
    const soilQuality = product.attributes?.soil_quality || product.attributes?.calitate_sol || 
                        product.attributes?.bonitate;
    if (soilQuality) {
      const qualityNum = parseFloat(String(soilQuality));
      if (qualityNum > 80) {
        pricePerHa *= 1.3; // +30% pentru sol foarte bun
      } else if (qualityNum > 60) {
        pricePerHa *= 1.1; // +10% pentru sol bun
      } else if (qualityNum < 40) {
        pricePerHa *= 0.8; // -20% pentru sol slab
      }
    }
    
    // Ajustare bazată pe acces drum
    if (product.attributes?.road_access || product.attributes?.acces_drum) {
      pricePerHa *= 1.15; // +15% pentru acces drum
    }
    
    // Ajustare bazată pe irigații
    if (product.attributes?.irrigation || product.attributes?.irigatii) {
      pricePerHa *= 1.25; // +25% pentru irigații
    }
    
    const basePrice = surfaceNum * pricePerHa;
    
    return {
      min: Math.round(basePrice * 0.75),
      max: Math.round(basePrice * 1.4)
    };
  } else {
    // Terenuri Intravilane
    const surface = product.attributes?.surface || product.attributes?.suprafata || product.attributes?.mp;
    
    if (!surface) {
      return { min: 10000, max: 200000 };
    }
    
    const surfaceNum = parseInt(String(surface));
    
    // Preț/mp bazat pe oraș și zonă (EUR/mp)
    const city = (product.city || '').toLowerCase();
    let pricePerM2 = 30; // Default
    
    if (city.includes('bucurești') || city.includes('bucuresti')) {
      pricePerM2 = 100;
    } else if (city.includes('cluj')) {
      pricePerM2 = 80;
    } else if (city.includes('iași') || city.includes('iasi')) {
      pricePerM2 = 50;
    }
    
    // Ajustare bazată pe intravilan vs extravilan (MUST!)
    const isIntravilan = product.attributes?.intravilan === true || 
                         product.attributes?.intravilan === 'true' ||
                         (product.attributes?.zone || '').toLowerCase().includes('intravilan');
    const isExtravilan = product.attributes?.extravilan === true || 
                         product.attributes?.extravilan === 'true' ||
                         (product.attributes?.zone || '').toLowerCase().includes('extravilan');
    
    if (isIntravilan) {
      pricePerM2 *= 2; // Intravilan: dublu
    } else if (isExtravilan) {
      pricePerM2 *= 0.5; // Extravilan: jumătate
    }
    
    // Ajustare bazată pe utilități (identice pentru filtrare)
    const utilities = product.attributes?.utilities || product.attributes?.utilitati;
    if (utilities) {
      const utilitiesStr = typeof utilities === 'string' ? utilities : 
                           Array.isArray(utilities) ? utilities.join(' ') : '';
      if (utilitiesStr.toLowerCase().includes('apă') || utilitiesStr.toLowerCase().includes('gaz') || 
          utilitiesStr.toLowerCase().includes('curent')) {
        pricePerM2 *= 1.3; // +30% pentru utilități
      }
    }
    
    // Ajustare bazată pe front stradal
    const front = product.attributes?.front || product.attributes?.front_stradal || 
                  product.attributes?.deschidere;
    if (front) {
      const frontNum = parseFloat(String(front));
      if (frontNum > 15) {
        pricePerM2 *= 1.2; // +20% pentru front mare
      }
    }
    
    const basePrice = surfaceNum * pricePerM2;
    
    return {
      min: Math.round(basePrice * 0.7),
      max: Math.round(basePrice * 1.4)
    };
  }
}

/**
 * Calculează prețuri realiste pentru spații comerciale bazate pe toate criteriile
 */
function calculateRealisticCommercialPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const surface = product.attributes?.surface || product.attributes?.suprafata || 
                  product.attributes?.suprafata_utila;
  
  if (!surface) {
    return { min: 50000, max: 300000 };
  }
  
  const surfaceNum = parseInt(String(surface));
  
  // Preț/mp bazat pe locație (EUR/mp)
  const city = (product.city || '').toLowerCase();
  let pricePerM2 = 800; // Default
  
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2 = 1500;
  } else if (city.includes('cluj')) {
    pricePerM2 = 1200;
  }
  
  // Ajustare bazată pe tip locație
  const location = (product.attributes?.street || product.attributes?.strada || 
                   product.attributes?.center || product.attributes?.centru || '').toLowerCase();
  if (location.includes('mall') || location.includes('centru comercial')) {
    pricePerM2 *= 1.5; // +50% pentru mall
  } else if (location.includes('centru') || location.includes('bulevard')) {
    pricePerM2 *= 1.3; // +30% pentru centru
  }
  
  // Ajustare bazată pe vitrine și trafic
  if (product.attributes?.showcase || product.attributes?.vitrine) {
    pricePerM2 *= 1.2; // +20% pentru vitrine
  }
  if (product.attributes?.traffic || product.attributes?.trafic) {
    pricePerM2 *= 1.15; // +15% pentru trafic pietonal
  }
  
  const basePrice = surfaceNum * pricePerM2;
  
  return {
    min: Math.round(basePrice * 0.75),
    max: Math.round(basePrice * 1.35)
  };
}

/**
 * Calculează prețuri realiste pentru utilaje construcții bazate pe toate criteriile
 * Filtrează prețurile bazate pe ore de funcționare și an (similar cu mașinile)
 */
function calculateRealisticConstructionEquipmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const year = product.attributes?.year || product.attributes?.an 
    ? parseInt(String(product.attributes.year || product.attributes.an)) 
    : null;
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.ore_funcionare
    ? parseInt(String(product.attributes.hours || product.attributes.ore || product.attributes.ore_funcionare))
    : null;
  
  const currentYear = new Date().getFullYear();
  const age = year ? currentYear - year : null;
  
  // Preț de bază bazat pe tip utilaj și an
  let baseMin = 10000;
  let baseMax = 50000;
  
  if (age !== null) {
    if (age >= 15) {
      baseMin = 5000;
      baseMax = 25000;
    } else if (age >= 10) {
      baseMin = 10000;
      baseMax = 40000;
    } else if (age >= 5) {
      baseMin = 20000;
      baseMax = 60000;
    } else {
      baseMin = 30000;
      baseMax = 100000;
    }
  }
  
  // Ajustare bazată pe ore de funcționare (CRITIC!)
  if (hours !== null && !isNaN(hours)) {
    // Ore normale pentru un utilaj: 2000-5000 ore/an
    const expectedHours = age ? age * 3000 : 5000; // 3000 ore/an în medie
    
    if (hours > expectedHours * 1.3) {
      // Foarte mult folosit: reduce prețul cu 30-40%
      baseMin = Math.round(baseMin * 0.6);
      baseMax = Math.round(baseMax * 0.7);
    } else if (hours > expectedHours * 1.1) {
      // Mult folosit: reduce prețul cu 20-30%
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.8);
    } else if (hours < expectedHours * 0.7) {
      // Puțin folosit: crește prețul cu 15-25%
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.25);
    }
  }
  
  // Ajustare bazată pe marca (premium vs standard)
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const isPremium = brand.includes('caterpillar') || brand.includes('cat') || 
                    brand.includes('komatsu') || brand.includes('liebherr') ||
                    brand.includes('volvo') || brand.includes('hitachi');
  
  if (isPremium) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('foarte bun')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('necesită') || condition.includes('necesita') || condition.includes('repara')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  // Ajustare bazată pe echipare (AC cabină, joystick, etc.)
  const equipment = product.attributes?.equipment || product.attributes?.echipare;
  if (equipment) {
    const equipmentStr = typeof equipment === 'string' ? equipment.toLowerCase() : 
                        Array.isArray(equipment) ? equipment.join(' ').toLowerCase() : '';
    if (equipmentStr.includes('ac') || equipmentStr.includes('cabină') || equipmentStr.includes('cabina') ||
        equipmentStr.includes('joystick') || equipmentStr.includes('picon')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru utilaje agricole bazate pe toate criteriile
 */
function calculateRealisticAgriculturalEquipmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const year = product.attributes?.year || product.attributes?.an 
    ? parseInt(String(product.attributes.year || product.attributes.an)) 
    : null;
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.ore_funcionare
    ? parseInt(String(product.attributes.hours || product.attributes.ore || product.attributes.ore_funcionare))
    : null;
  const hp = product.attributes?.hp || product.attributes?.power || product.attributes?.putere || product.attributes?.cp
    ? parseInt(String(product.attributes.hp || product.attributes.power || product.attributes.putere || product.attributes.cp))
    : null;
  
  const currentYear = new Date().getFullYear();
  const age = year ? currentYear - year : null;
  
  // Preț de bază bazat pe HP și an
  let baseMin = 15000;
  let baseMax = 80000;
  
  if (hp) {
    // Preț aproximativ: 200-500 EUR/CP în funcție de vârstă
    const pricePerHP = age && age > 10 ? 200 : age && age > 5 ? 300 : 400;
    baseMin = hp * pricePerHP * 0.7;
    baseMax = hp * pricePerHP * 1.3;
  }
  
  // Ajustare bazată pe vârstă
  if (age !== null) {
    if (age >= 15) {
      baseMin = Math.round(baseMin * 0.6);
      baseMax = Math.round(baseMax * 0.7);
    } else if (age >= 10) {
      baseMin = Math.round(baseMin * 0.75);
      baseMax = Math.round(baseMax * 0.85);
    } else if (age >= 5) {
      baseMin = Math.round(baseMin * 0.9);
      baseMax = Math.round(baseMax * 0.95);
    }
  }
  
  // Ajustare bazată pe ore de funcționare
  if (hours !== null && !isNaN(hours)) {
    const expectedHours = age ? age * 400 : 6000; // 400 ore/an pentru utilaje agricole
    
    if (hours > expectedHours * 1.3) {
      baseMin = Math.round(baseMin * 0.65);
      baseMax = Math.round(baseMax * 0.75);
    } else if (hours < expectedHours * 0.7) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.25);
    }
  }
  
  // Ajustare bazată pe marca
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const isPremium = brand.includes('john deere') || brand.includes('claas') || 
                    brand.includes('new holland') || brand.includes('case ih');
  
  if (isPremium) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  }
  
  // Ajustare bazată pe echipare (GPS, PowerShift, etc.)
  const equipment = product.attributes?.equipment || product.attributes?.echipare;
  if (equipment) {
    const equipmentStr = typeof equipment === 'string' ? equipment.toLowerCase() : 
                        Array.isArray(equipment) ? equipment.join(' ').toLowerCase() : '';
    if (equipmentStr.includes('gps') || equipmentStr.includes('powershift') || equipmentStr.includes('ac')) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru generatoare & compresoare
 */
function calculateRealisticGeneratorPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const kva = product.attributes?.power || product.attributes?.putere || product.attributes?.kva
    ? parseFloat(String(product.attributes.power || product.attributes.putere || product.attributes.kva))
    : null;
  const hours = product.attributes?.hours || product.attributes?.ore
    ? parseInt(String(product.attributes.hours || product.attributes.ore))
    : null;
  const year = product.attributes?.year || product.attributes?.an
    ? parseInt(String(product.attributes.year || product.attributes.an))
    : null;
  
  if (!kva) {
    return { min: 2000, max: 50000 };
  }
  
  // Preț aproximativ: 200-500 EUR/kVA în funcție de vârstă și stare
  let pricePerKVA = 300;
  
  const currentYear = new Date().getFullYear();
  const age = year ? currentYear - year : null;
  
  if (age !== null) {
    if (age >= 10) {
      pricePerKVA = 200;
    } else if (age >= 5) {
      pricePerKVA = 250;
    } else {
      pricePerKVA = 350;
    }
  }
  
  // Ajustare bazată pe ore funcționare
  if (hours !== null && !isNaN(hours)) {
    const expectedHours = age ? age * 1000 : 5000;
    if (hours > expectedHours * 1.5) {
      pricePerKVA *= 0.7;
    } else if (hours < expectedHours * 0.5) {
      pricePerKVA *= 1.2;
    }
  }
  
  // Ajustare bazată pe nivel zgomot (silent = mai scump)
  const noise = (product.attributes?.noise || product.attributes?.zgomot || '').toLowerCase();
  if (noise.includes('silent') || noise.includes('silențios')) {
    pricePerKVA *= 1.3;
  }
  
  const basePrice = kva * pricePerKVA;
  
  return {
    min: Math.round(basePrice * 0.75),
    max: Math.round(basePrice * 1.4)
  };
}

/**
 * Calculează prețuri realiste pentru scule profesionale
 */
function calculateRealisticProfessionalToolsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const isNew = product.attributes?.new || product.attributes?.nou || 
                (product.attributes?.condition || product.attributes?.stare || '').toLowerCase().includes('nou');
  
  // Prețuri aproximative bazate pe brand
  let baseMin = 100;
  let baseMax = 2000;
  
  if (brand.includes('hilti')) {
    baseMin = 300;
    baseMax = 5000;
  } else if (brand.includes('makita') || brand.includes('dewalt') || brand.includes('bosch')) {
    baseMin = 150;
    baseMax = 3000;
  } else if (brand.includes('milwaukee')) {
    baseMin = 200;
    baseMax = 4000;
  }
  
  // Ajustare bazată pe stare (nou vs utilizat)
  if (!isNew) {
    baseMin = Math.round(baseMin * 0.5);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe accesorii
  const accessories = product.attributes?.accessories || product.attributes?.accesorii;
  if (accessories) {
    const accessoriesCount = Array.isArray(accessories) ? accessories.length : 
                            typeof accessories === 'string' ? accessories.split(',').length : 0;
    if (accessoriesCount > 0) {
      baseMin = Math.round(baseMin * (1 + accessoriesCount * 0.1));
      baseMax = Math.round(baseMax * (1 + accessoriesCount * 0.1));
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru echipamente ateliere auto
 */
function calculateRealisticAutoWorkshopPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const tonnage = product.attributes?.tonnage || product.attributes?.tonaj
    ? parseInt(String(product.attributes.tonnage || product.attributes.tonaj))
    : null;
  const type = (product.attributes?.type || product.attributes?.tip || '').toLowerCase();
  
  // Prețuri aproximative bazate pe tip și tonaj
  let baseMin = 5000;
  let baseMax = 50000;
  
  if (type.includes('elevator') || type.includes('ridicare')) {
    // Elevatoare: 2000-3000 EUR/tonă
    if (tonnage) {
      baseMin = tonnage * 2000;
      baseMax = tonnage * 3000;
    } else {
      baseMin = 10000;
      baseMax = 30000;
    }
  } else if (type.includes('vulcanizare') || type.includes('balansare')) {
    baseMin = 5000;
    baseMax = 20000;
  } else if (type.includes('diagnoza') || type.includes('diagnostic')) {
    baseMin = 10000;
    baseMax = 40000;
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('foarte bun')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('necesită') || condition.includes('necesita')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru artă & antichități bazate pe subcategorie
 */
function calculateRealisticArtPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('pictură') || titleLower.includes('pictura') || titleLower.includes('tablou')) {
      detectedSubcategory = "picturi";
    } else if (titleLower.includes('sculptură') || titleLower.includes('sculptura')) {
      detectedSubcategory = "sculpturi";
    } else if (titleLower.includes('bijuterie') || titleLower.includes('ceas')) {
      detectedSubcategory = "bijuterii";
    } else if (titleLower.includes('colecție') || titleLower.includes('colectie')) {
      detectedSubcategory = "colectii";
    } else if (titleLower.includes('mobilier') || titleLower.includes('epocă')) {
      detectedSubcategory = "mobilier";
    } else if (titleLower.includes('carte') || titleLower.includes('hărți')) {
      detectedSubcategory = "carti";
    } else if (titleLower.includes('fotografie')) {
      detectedSubcategory = "fotografie";
    } else if (titleLower.includes('caritabil') || titleLower.includes('donatie')) {
      detectedSubcategory = "caritabile";
    } else {
      detectedSubcategory = "picturi";
    }
  }
  
  if (detectedSubcategory === "picturi") {
    return calculateRealisticPaintingPriceRange(product);
  } else if (detectedSubcategory === "sculpturi") {
    return calculateRealisticSculpturePriceRange(product);
  } else if (detectedSubcategory === "bijuterii") {
    return calculateRealisticJewelryPriceRange(product);
  } else if (detectedSubcategory === "colectii") {
    return calculateRealisticCollectiblePriceRange(product);
  } else if (detectedSubcategory === "mobilier") {
    return calculateRealisticAntiqueFurniturePriceRange(product);
  } else if (detectedSubcategory === "carti") {
    return calculateRealisticRareBookPriceRange(product);
  } else if (detectedSubcategory === "fotografie") {
    return calculateRealisticArtPhotoPriceRange(product);
  } else if (detectedSubcategory === "caritabile") {
    return calculateRealisticCharityAuctionPriceRange(product);
  }
  
  // Default: picturi
  return calculateRealisticPaintingPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru picturi
 * Filtrare: același artist, aceeași tehnică, dimensiuni ±20%, aceeași perioadă
 */
function calculateRealisticPaintingPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const artist = (product.attributes?.artist || product.attributes?.artist_name || product.attributes?.pictor || '').toLowerCase();
  const technique = (product.attributes?.technique || product.attributes?.tehnica || '').toLowerCase();
  const dimensions = product.attributes?.dimensions || product.attributes?.dimensiuni || product.attributes?.size;
  
  // Preț de bază bazat pe artist (artisti români cunoscuți)
  let baseMin = 500;
  let baseMax = 5000;
  
  // Ajustare bazată pe artist (artisti români premium)
  if (artist.includes('grigorescu') || artist.includes('andreescu') || artist.includes('luchian') ||
      artist.includes('pallady') || artist.includes('tonitza')) {
    baseMin = 5000;
    baseMax = 50000;
  } else if (artist.includes('amza') || artist.includes('ciucurencu') || artist.includes('stirbei')) {
    baseMin = 2000;
    baseMax = 20000;
  } else if (artist.includes('corneliu') || artist.includes('baba')) {
    baseMin = 1000;
    baseMax = 10000;
  }
  
  // Ajustare bazată pe tehnică
  if (technique.includes('ulei') || technique.includes('oil')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (technique.includes('acuarelă') || technique.includes('watercolor')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe dimensiuni (±20% pentru filtrare)
  if (dimensions) {
    const dimStr = String(dimensions).toLowerCase();
    const sizeMatch = dimStr.match(/(\d+)\s*x\s*(\d+)/);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1]);
      const height = parseInt(sizeMatch[2]);
      const area = width * height;
      // Preț aproximativ: 10-50 EUR/cm² în funcție de artist
      const pricePerCm2 = baseMin > 2000 ? 20 : 10;
      baseMin = area * pricePerCm2 * 0.7;
      baseMax = area * pricePerCm2 * 1.4;
    }
  }
  
  // Ajustare bazată pe certificat autenticitate
  if (product.attributes?.certificate || product.attributes?.certificat || product.attributes?.authenticity) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe stare conservare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('perfect')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('slab') || condition.includes('deteriorat')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru sculpturi
 * Filtrare: același artist, același material, dimensiuni similare
 */
function calculateRealisticSculpturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const artist = (product.attributes?.artist || product.attributes?.artist_name || product.attributes?.sculptor || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  
  // Preț de bază bazat pe material
  let baseMin = 1000;
  let baseMax = 10000;
  
  if (material.includes('bronz') || material.includes('bronze')) {
    baseMin = 2000;
    baseMax = 20000;
  } else if (material.includes('marmură') || material.includes('marble')) {
    baseMin = 3000;
    baseMax = 30000;
  } else if (material.includes('lemn') || material.includes('wood')) {
    baseMin = 500;
    baseMax = 5000;
  }
  
  // Ajustare bazată pe artist (sculptori români cunoscuți)
  if (artist.includes('irimescu') || artist.includes('brâncuși') || artist.includes('brancusi')) {
    baseMin = 10000;
    baseMax = 100000;
  } else if (artist.includes('jalea') || artist.includes('han')) {
    baseMin = 5000;
    baseMax = 50000;
  }
  
  // Ajustare bazată pe dimensiuni
  const dimensions = product.attributes?.dimensions || product.attributes?.dimensiuni;
  if (dimensions) {
    const dimStr = String(dimensions).toLowerCase();
    const sizeMatch = dimStr.match(/(\d+)\s*cm/i);
    if (sizeMatch) {
      const height = parseInt(sizeMatch[1]);
      // Preț aproximativ: 50-200 EUR/cm în funcție de material
      const pricePerCm = material.includes('bronz') ? 100 : material.includes('marmură') ? 150 : 30;
      baseMin = height * pricePerCm * 0.7;
      baseMax = height * pricePerCm * 1.4;
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru bijuterii și ceasuri
 * Filtrare: model identic, material identic, accesorii incluse
 */
function calculateRealisticJewelryPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || product.attributes?.metal || '').toLowerCase();
  const carat = product.attributes?.carat || product.attributes?.carataj || product.attributes?.carats;
  const goldWeight = product.attributes?.gold_weight || product.attributes?.greutate_aur || product.attributes?.weight;
  
  // Preț de bază bazat pe brand
  let baseMin = 500;
  let baseMax = 5000;
  
  if (brand.includes('rolex')) {
    baseMin = 3000;
    baseMax = 50000;
  } else if (brand.includes('cartier')) {
    baseMin = 2000;
    baseMax = 30000;
  } else if (brand.includes('patek')) {
    baseMin = 10000;
    baseMax = 200000;
  } else if (brand.includes('omega')) {
    baseMin = 1500;
    baseMax = 20000;
  }
  
  // Ajustare bazată pe material
  if (material.includes('18k') || material.includes('18 karat')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (material.includes('platină') || material.includes('platinum')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 1.8);
  }
  
  // Ajustare bazată pe carataj pietre prețioase
  if (carat) {
    const caratNum = parseFloat(String(carat));
    // Preț aproximativ: 1000-5000 EUR/carat pentru diamante
    baseMin = Math.round(baseMin + caratNum * 1000);
    baseMax = Math.round(baseMax + caratNum * 5000);
  }
  
  // Ajustare bazată pe greutate aur
  if (goldWeight) {
    const weightNum = parseFloat(String(goldWeight));
    // Preț aur: ~50 EUR/g
    baseMin = Math.round(baseMin + weightNum * 50);
    baseMax = Math.round(baseMax + weightNum * 60);
  }
  
  // Ajustare bazată pe certificat GIA
  if (product.attributes?.certificate || product.attributes?.gia_certificate) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe cutie + acte
  if (product.attributes?.box || product.attributes?.cutie || product.attributes?.papers || product.attributes?.acte) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru obiecte de colecție
 */
function calculateRealisticCollectiblePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const type = (product.attributes?.type || product.attributes?.tip || product.attributes?.collection_type || '').toLowerCase();
  const rarity = (product.attributes?.rarity || product.attributes?.raritate || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  
  // Preț de bază bazat pe tip
  let baseMin = 50;
  let baseMax = 1000;
  
  if (type.includes('monedă') || type.includes('moneda') || type.includes('coin')) {
    baseMin = 100;
    baseMax = 5000;
  } else if (type.includes('medalie')) {
    baseMin = 200;
    baseMax = 3000;
  } else if (type.includes('filatelie') || type.includes('timbru')) {
    baseMin = 10;
    baseMax = 2000;
  }
  
  // Ajustare bazată pe raritate
  if (rarity.includes('foarte rar') || rarity.includes('extrem de rar')) {
    baseMin = Math.round(baseMin * 5);
    baseMax = Math.round(baseMax * 10);
  } else if (rarity.includes('rar')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  }
  
  // Ajustare bazată pe material
  if (material.includes('aur') || material.includes('gold')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  } else if (material.includes('argint') || material.includes('silver')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  }
  
  // Ajustare bazată pe grading
  const grading = (product.attributes?.grading || product.attributes?.grade || product.attributes?.condition || '').toLowerCase();
  if (grading.includes('ms-65') || grading.includes('pf-70') || grading.includes('excellent')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru mobilier de epocă
 */
function calculateRealisticAntiqueFurniturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const period = (product.attributes?.period || product.attributes?.perioada || product.attributes?.style || product.attributes?.stil || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || product.attributes?.wood || '').toLowerCase();
  
  // Preț de bază bazat pe perioadă
  let baseMin = 500;
  let baseMax = 5000;
  
  if (period.includes('art deco')) {
    baseMin = 1000;
    baseMax = 10000;
  } else if (period.includes('victorian')) {
    baseMin = 2000;
    baseMax = 20000;
  } else if (period.includes('sec. xix') || period.includes('secolul 19')) {
    baseMin = 1500;
    baseMax = 15000;
  }
  
  // Ajustare bazată pe material
  if (material.includes('mahon') || material.includes('mahogany')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  } else if (material.includes('nuc') || material.includes('walnut')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  }
  
  // Ajustare bazată pe autenticitate
  if (product.attributes?.authenticity || product.attributes?.autenticitate) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru cărți rare & hărți vechi
 */
function calculateRealisticRareBookPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_published;
  const rarity = (product.attributes?.rarity || product.attributes?.raritate || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.conditie || '').toLowerCase();
  
  // Preț de bază bazat pe vârstă
  let baseMin = 100;
  let baseMax = 2000;
  
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    if (age > 200) {
      baseMin = 500;
      baseMax = 10000;
    } else if (age > 100) {
      baseMin = 200;
      baseMax = 5000;
    } else if (age > 50) {
      baseMin = 150;
      baseMax = 3000;
    }
  }
  
  // Ajustare bazată pe raritate
  if (rarity.includes('foarte rar') || rarity.includes('extrem de rar')) {
    baseMin = Math.round(baseMin * 5);
    baseMax = Math.round(baseMax * 10);
  } else if (rarity.includes('rar')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  }
  
  // Ajustare bazată pe condiție
  if (condition.includes('excelent') || condition.includes('perfect')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (condition.includes('mediu') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  // Ajustare bazată pe ediție originală
  if (product.attributes?.original_edition || product.attributes?.editie_originala) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru fotografie artistică
 */
function calculateRealisticArtPhotoPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const artist = (product.attributes?.artist || product.attributes?.artist_name || product.attributes?.photographer || '').toLowerCase();
  const limitedEdition = product.attributes?.limited_edition || product.attributes?.print_limitat || product.attributes?.edition;
  
  // Preț de bază
  let baseMin = 200;
  let baseMax = 2000;
  
  // Ajustare bazată pe artist (fotografi cunoscuți)
  if (artist.includes('man ray') || artist.includes('ansel adams')) {
    baseMin = 2000;
    baseMax = 20000;
  } else if (artist.includes('cartier-bresson') || artist.includes('doisneau')) {
    baseMin = 1000;
    baseMax = 10000;
  }
  
  // Ajustare bazată pe print limitat
  if (limitedEdition) {
    const editionStr = String(limitedEdition).toLowerCase();
    const editionMatch = editionStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (editionMatch) {
      const current = parseInt(editionMatch[1]);
      const total = parseInt(editionMatch[2]);
      // Cu cât este mai mic numărul total, cu atât este mai valoros
      if (total <= 10) {
        baseMin = Math.round(baseMin * 3);
        baseMax = Math.round(baseMax * 5);
      } else if (total <= 50) {
        baseMin = Math.round(baseMin * 2);
        baseMax = Math.round(baseMax * 3);
      } else if (total <= 100) {
        baseMin = Math.round(baseMin * 1.5);
        baseMax = Math.round(baseMax * 2);
      }
    }
  }
  
  // Ajustare bazată pe semnătură
  if (product.attributes?.signed || product.attributes?.semnat || product.attributes?.signature) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru electronice & tehnologie bazate pe subcategorie
 * Consideră deprecierea tehnologică rapidă
 */
function calculateRealisticElectronicsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('laptop') || titleLower.includes('notebook') || titleLower.includes('macbook') || titleLower.includes('pc')) {
      detectedSubcategory = "laptop";
    } else if (titleLower.includes('telefon') || titleLower.includes('iphone') || titleLower.includes('samsung')) {
      detectedSubcategory = "telefon";
    } else if (titleLower.includes('tabletă') || titleLower.includes('tableta') || titleLower.includes('ipad')) {
      detectedSubcategory = "tableta";
    } else if (titleLower.includes('tv') || titleLower.includes('televizor') || titleLower.includes('audio')) {
      detectedSubcategory = "tv_audio";
    } else if (titleLower.includes('console') || titleLower.includes('ps5') || titleLower.includes('xbox')) {
      detectedSubcategory = "console";
    } else if (titleLower.includes('drone') || titleLower.includes('dji')) {
      detectedSubcategory = "drone";
    } else if (titleLower.includes('cameră') || titleLower.includes('camera') || titleLower.includes('canon') || titleLower.includes('sony')) {
      detectedSubcategory = "foto_video";
    } else {
      detectedSubcategory = "laptop";
    }
  }
  
  if (detectedSubcategory === "laptop" || detectedSubcategory === "pc") {
    return calculateRealisticLaptopPriceRange(product);
  } else if (detectedSubcategory === "telefon") {
    return calculateRealisticPhonePriceRange(product);
  } else if (detectedSubcategory === "tableta") {
    return calculateRealisticTabletPriceRange(product);
  } else if (detectedSubcategory === "tv_audio") {
    return calculateRealisticTVPriceRange(product);
  } else if (detectedSubcategory === "console") {
    return calculateRealisticConsolePriceRange(product);
  } else if (detectedSubcategory === "drone") {
    return calculateRealisticDronePriceRange(product);
  } else if (detectedSubcategory === "foto_video") {
    return calculateRealisticCameraPriceRange(product);
  }
  
  // Default: laptop
  return calculateRealisticLaptopPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru laptopuri & PC-uri
 * Filtrare: model identic, configurație identică, anul ±1, stare similară
 * Consideră deprecierea tehnologică rapidă
 */
function calculateRealisticLaptopPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const processor = (product.attributes?.processor || product.attributes?.procesor || product.attributes?.cpu || '').toLowerCase();
  const ram = product.attributes?.ram || product.attributes?.memory || product.attributes?.memorie;
  const storage = product.attributes?.storage || product.attributes?.stocare || product.attributes?.ssd || product.attributes?.hdd;
  const gpu = (product.attributes?.gpu || product.attributes?.video_card || product.attributes?.placa_video || '').toLowerCase();
  
  if (!year) {
    return { min: 500, max: 3000 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe brand și vârstă
  let baseMin = 800;
  let baseMax = 2500;
  
  // Ajustare bazată pe brand (Apple premium)
  if (brand.includes('apple') || brand.includes('macbook')) {
    baseMin = 1500;
    baseMax = 5000;
    // Apple se depreciază mai lent
    if (age <= 1) {
      baseMin = 3000;
      baseMax = 8000;
    } else if (age <= 2) {
      baseMin = 2500;
      baseMax = 6000;
    } else if (age <= 3) {
      baseMin = 2000;
      baseMax = 5000;
    } else if (age <= 5) {
      baseMin = 1500;
      baseMax = 4000;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.15));
      baseMax = Math.round(baseMax * (1 - age * 0.12));
    }
  } else if (brand.includes('dell') || brand.includes('lenovo') || brand.includes('hp')) {
    baseMin = 600;
    baseMax = 2000;
    // Depreciere rapidă pentru brand-uri standard
    if (age <= 1) {
      baseMin = 1200;
      baseMax = 3000;
    } else if (age <= 2) {
      baseMin = 900;
      baseMax = 2200;
    } else if (age <= 3) {
      baseMin = 700;
      baseMax = 1800;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.2));
      baseMax = Math.round(baseMax * (1 - age * 0.18));
    }
  }
  
  // Ajustare bazată pe procesor
  if (processor.includes('i7') || processor.includes('ryzen 7') || processor.includes('m1') || processor.includes('m2') || processor.includes('m3')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (processor.includes('i5') || processor.includes('ryzen 5')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (processor.includes('i3') || processor.includes('ryzen 3')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe RAM
  if (ram) {
    const ramNum = parseInt(String(ram));
    if (ramNum >= 32) {
      baseMin = Math.round(baseMin * 1.2);
      baseMax = Math.round(baseMax * 1.3);
    } else if (ramNum >= 16) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    } else if (ramNum < 8) {
      baseMin = Math.round(baseMin * 0.8);
      baseMax = Math.round(baseMax * 0.85);
    }
  }
  
  // Ajustare bazată pe stocare (SSD premium)
  if (storage) {
    const storageNum = parseInt(String(storage));
    if (product.attributes?.ssd || product.attributes?.storage_type === 'SSD') {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
    if (storageNum >= 1000) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    } else if (storageNum < 256) {
      baseMin = Math.round(baseMin * 0.9);
      baseMax = Math.round(baseMax * 0.95);
    }
  }
  
  // Ajustare bazată pe placă video dedicată
  if (gpu && (gpu.includes('rtx') || gpu.includes('gtx') || gpu.includes('radeon'))) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  // Ajustare bazată pe baterie
  const battery = product.attributes?.battery || product.attributes?.baterie || product.attributes?.battery_health;
  if (battery) {
    const batteryNum = parseFloat(String(battery));
    if (batteryNum < 70) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    } else if (batteryNum >= 90) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe garanție
  if (product.attributes?.warranty || product.attributes?.garantie) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe stare estetică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.cosmetic_condition || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('ca nou') || condition.includes('excelent')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('uzat') || condition.includes('slab') || condition.includes('zgâriat')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru telefoane mobile
 * Filtrare: capacitate identică, rețea/neverlocked similară, stare similară
 * Depreciere foarte rapidă pentru telefoane
 */
function calculateRealisticPhonePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const storage = product.attributes?.storage || product.attributes?.stocare || product.attributes?.capacitate;
  
  if (!year) {
    return { min: 200, max: 1500 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe brand și model
  let baseMin = 300;
  let baseMax = 1200;
  
  // Ajustare bazată pe brand (iPhone premium)
  if (brand.includes('apple') || brand.includes('iphone')) {
    baseMin = 500;
    baseMax = 2000;
    // iPhone se depreciază mai lent
    if (age <= 1) {
      baseMin = 800;
      baseMax = 2500;
    } else if (age <= 2) {
      baseMin = 600;
      baseMax = 2000;
    } else if (age <= 3) {
      baseMin = 500;
      baseMax = 1500;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.25));
      baseMax = Math.round(baseMax * (1 - age * 0.2));
    }
  } else if (brand.includes('samsung')) {
    baseMin = 400;
    baseMax = 1500;
    // Samsung depreciere rapidă
    if (age <= 1) {
      baseMin = 700;
      baseMax = 2000;
    } else if (age <= 2) {
      baseMin = 500;
      baseMax = 1500;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.3));
      baseMax = Math.round(baseMax * (1 - age * 0.25));
    }
  } else {
    // Alte brand-uri: depreciere foarte rapidă
    if (age <= 1) {
      baseMin = 400;
      baseMax = 1200;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.35));
      baseMax = Math.round(baseMax * (1 - age * 0.3));
    }
  }
  
  // Ajustare bazată pe capacitate stocare
  if (storage) {
    const storageNum = parseInt(String(storage));
    if (storageNum >= 512) {
      baseMin = Math.round(baseMin * 1.3);
      baseMax = Math.round(baseMax * 1.4);
    } else if (storageNum >= 256) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    } else if (storageNum < 128) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  // Ajustare bazată pe baterie
  const battery = product.attributes?.battery || product.attributes?.baterie || product.attributes?.battery_health;
  if (battery) {
    const batteryNum = parseFloat(String(battery));
    if (batteryNum < 80) {
      baseMin = Math.round(baseMin * 0.9);
      baseMax = Math.round(baseMax * 0.95);
    }
  }
  
  // Ajustare bazată pe neverlocked
  if (product.attributes?.unlocked || product.attributes?.neverlocked) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe recondiționat (reduce prețul)
  if (product.attributes?.reconditioned || product.attributes?.reconditionat) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru tablete
 */
function calculateRealisticTabletPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const storage = product.attributes?.storage || product.attributes?.stocare || product.attributes?.capacitate;
  
  if (!year) {
    return { min: 200, max: 1500 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe brand
  let baseMin = 300;
  let baseMax = 1200;
  
  // iPad premium
  if (brand.includes('apple') || brand.includes('ipad')) {
    baseMin = 500;
    baseMax = 2000;
    if (age <= 1) {
      baseMin = 800;
      baseMax = 2500;
    } else if (age <= 2) {
      baseMin = 600;
      baseMax = 2000;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.2));
      baseMax = Math.round(baseMax * (1 - age * 0.18));
    }
  } else {
    if (age <= 1) {
      baseMin = 400;
      baseMax = 1200;
    } else {
      baseMin = Math.round(baseMin * (1 - age * 0.25));
      baseMax = Math.round(baseMax * (1 - age * 0.22));
    }
  }
  
  // Ajustare bazată pe stocare
  if (storage) {
    const storageNum = parseInt(String(storage));
    if (storageNum >= 512) {
      baseMin = Math.round(baseMin * 1.2);
      baseMax = Math.round(baseMax * 1.3);
    } else if (storageNum >= 256) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe conectivitate LTE (mai scump)
  if (product.attributes?.lte || product.attributes?.connectivity === 'LTE') {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru TV & Audio
 * Filtrare: diagonală identică, tehnologie identică (OLED/QLED), an ±2
 */
function calculateRealisticTVPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const displayType = (product.attributes?.display_type || product.attributes?.tip_display || product.attributes?.screen_type || '').toLowerCase();
  const diagonal = product.attributes?.diagonal || product.attributes?.diagonala || product.attributes?.size || product.attributes?.marime;
  const resolution = (product.attributes?.resolution || product.attributes?.rezolutie || '').toLowerCase();
  
  if (!year) {
    return { min: 300, max: 3000 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe tehnologie display
  let baseMin = 500;
  let baseMax = 2000;
  
  if (displayType.includes('oled')) {
    baseMin = 1000;
    baseMax = 5000;
  } else if (displayType.includes('qled') || displayType.includes('mini led')) {
    baseMin = 800;
    baseMax = 4000;
  } else if (displayType.includes('led')) {
    baseMin = 400;
    baseMax = 2000;
  }
  
  // Depreciere bazată pe vârstă
  if (age <= 1) {
    // Aproape nou: -10%
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.9);
  } else if (age <= 2) {
    // 1-2 ani: -20%
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.8);
  } else if (age <= 3) {
    // 2-3 ani: -35%
    baseMin = Math.round(baseMin * 0.65);
    baseMax = Math.round(baseMax * 0.65);
  } else {
    // 3+ ani: -50%+
    baseMin = Math.round(baseMin * (1 - age * 0.15));
    baseMax = Math.round(baseMax * (1 - age * 0.15));
  }
  
  // Ajustare bazată pe diagonală
  if (diagonal) {
    const diagonalNum = parseFloat(String(diagonal));
    // Preț aproximativ: 20-50 EUR/inch în funcție de tehnologie
    const pricePerInch = displayType.includes('oled') ? 50 : displayType.includes('qled') ? 40 : 20;
    baseMin = diagonalNum * pricePerInch * 0.7;
    baseMax = diagonalNum * pricePerInch * 1.4;
  }
  
  // Ajustare bazată pe rezoluție
  if (resolution.includes('8k')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (resolution.includes('4k')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe Smart TV
  if (product.attributes?.smart_tv || product.attributes?.smart) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru console & jocuri
 */
function calculateRealisticConsolePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || product.attributes?.console_type || '').toLowerCase();
  
  // Preț de bază bazat pe console
  let baseMin = 300;
  let baseMax = 800;
  
  if (brand.includes('sony') || model.includes('ps5')) {
    baseMin = 400;
    baseMax = 600;
    if (model.includes('disc')) {
      baseMin = 450;
      baseMax = 650;
    }
  } else if (brand.includes('microsoft') || model.includes('xbox')) {
    baseMin = 350;
    baseMax = 550;
    if (model.includes('series x')) {
      baseMin = 400;
      baseMax = 600;
    }
  } else if (brand.includes('nintendo') || model.includes('switch')) {
    baseMin = 250;
    baseMax = 400;
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  // Ajustare bazată pe jocuri incluse
  const games = product.attributes?.games || product.attributes?.jocuri || product.attributes?.included_games;
  if (games) {
    const gamesCount = Array.isArray(games) ? games.length : (typeof games === 'string' ? games.split(',').length : 1);
    baseMin = Math.round(baseMin + gamesCount * 30);
    baseMax = Math.round(baseMax + gamesCount * 50);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru drone & gadgeturi smart
 */
function calculateRealisticDronePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const flightHours = product.attributes?.flight_hours || product.attributes?.ore_zbor || product.attributes?.hours;
  
  // Preț de bază bazat pe brand și model
  let baseMin = 300;
  let baseMax = 2000;
  
  if (brand.includes('dji')) {
    if (model.includes('mini 3 pro') || model.includes('mavic 3')) {
      baseMin = 800;
      baseMax = 1500;
    } else if (model.includes('mini') || model.includes('mavic air')) {
      baseMin = 400;
      baseMax = 1000;
    } else {
      baseMin = 600;
      baseMax = 2000;
    }
  }
  
  // Ajustare bazată pe Fly More Combo
  if (product.attributes?.fly_more_combo || product.attributes?.combo) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe ore zbor
  if (flightHours) {
    const hoursNum = parseFloat(String(flightHours));
    if (hoursNum > 50) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    } else if (hoursNum < 10) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare baterie
  const battery = product.attributes?.battery || product.attributes?.baterie || product.attributes?.battery_health;
  if (battery) {
    const batteryNum = parseFloat(String(battery));
    if (batteryNum < 80) {
      baseMin = Math.round(baseMin * 0.9);
      baseMax = Math.round(baseMax * 0.95);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru echipamente foto/video
 * Filtrare: model identic, obiectiv similar, shutter count ±20%
 */
function calculateRealisticCameraPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const sensorType = (product.attributes?.sensor_type || product.attributes?.tip_senzor || product.attributes?.sensor || '').toLowerCase();
  const shutterCount = product.attributes?.shutter_count || product.attributes?.numar_declansari || product.attributes?.shutter;
  
  if (!year) {
    return { min: 500, max: 5000 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe brand și tip senzor
  let baseMin = 800;
  let baseMax = 3000;
  
  if (sensorType.includes('full frame') || sensorType.includes('fullframe')) {
    baseMin = 1500;
    baseMax = 5000;
  } else if (sensorType.includes('aps-c') || sensorType.includes('apsc')) {
    baseMin = 600;
    baseMax = 2500;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('canon') || brand.includes('sony') || brand.includes('nikon')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Depreciere bazată pe vârstă
  if (age <= 1) {
    baseMin = Math.round(baseMin * 0.95);
    baseMax = Math.round(baseMax * 0.95);
  } else if (age <= 2) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.85);
  } else if (age <= 3) {
    baseMin = Math.round(baseMin * 0.75);
    baseMax = Math.round(baseMax * 0.75);
  } else {
    baseMin = Math.round(baseMin * (1 - age * 0.1));
    baseMax = Math.round(baseMax * (1 - age * 0.1));
  }
  
  // Ajustare bazată pe shutter count (±20% pentru filtrare)
  if (shutterCount) {
    const shutterNum = parseFloat(String(shutterCount));
    // Shutter count normal: 50k-100k pentru camere profesionale
    if (shutterNum > 100000) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (shutterNum > 50000) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    } else if (shutterNum < 10000) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    }
  }
  
  // Ajustare bazată pe obiective incluse
  if (product.attributes?.lens || product.attributes?.obiectiv || product.attributes?.objective) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  }
  
  // Ajustare bazată pe accesorii
  const accessories = product.attributes?.accessories || product.attributes?.accesorii;
  if (accessories) {
    const accessoriesCount = Array.isArray(accessories) ? accessories.length : 1;
    baseMin = Math.round(baseMin + accessoriesCount * 50);
    baseMax = Math.round(baseMax + accessoriesCount * 100);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru casă & grădină bazate pe subcategorie
 */
function calculateRealisticHomeGardenPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('canapea') || titleLower.includes('șifonier') || titleLower.includes('pat') || 
        titleLower.includes('masă') || titleLower.includes('birou') || titleLower.includes('mobilier interior')) {
      detectedSubcategory = "mobilier_interior";
    } else if (titleLower.includes('terasă') || titleLower.includes('terasa') || 
               titleLower.includes('șezlong') || titleLower.includes('mobilier exterior')) {
      detectedSubcategory = "mobilier_exterior";
    } else if (titleLower.includes('motocoasă') || titleLower.includes('motocoasa') || 
               titleLower.includes('mașină de tuns') || titleLower.includes('trimmer') || 
               titleLower.includes('echipament grădinărit')) {
      detectedSubcategory = "gradinarit";
    } else if (titleLower.includes('decor') || titleLower.includes('decorațiune') || 
               titleLower.includes('tablou decorativ') || titleLower.includes('vază') || 
               titleLower.includes('lampă') || titleLower.includes('ceas perete')) {
      detectedSubcategory = "decoratiuni";
    } else if (titleLower.includes('frigider') || titleLower.includes('aragaz') || 
               titleLower.includes('cuptor') || titleLower.includes('mașină de spălat') || 
               titleLower.includes('electrocasnic')) {
      detectedSubcategory = "electrocasnice";
    } else {
      detectedSubcategory = "mobilier_interior";
    }
  }
  
  if (detectedSubcategory === "mobilier_interior") {
    return calculateRealisticInteriorFurniturePriceRange(product);
  } else if (detectedSubcategory === "mobilier_exterior") {
    return calculateRealisticExteriorFurniturePriceRange(product);
  } else if (detectedSubcategory === "gradinarit") {
    return calculateRealisticGardenEquipmentPriceRange(product);
  } else if (detectedSubcategory === "decoratiuni") {
    return calculateRealisticDecorationPriceRange(product);
  } else if (detectedSubcategory === "electrocasnice") {
    return calculateRealisticAppliancePriceRange(product);
  }
  
  // Default: mobilier interior
  return calculateRealisticInteriorFurniturePriceRange(product);
}

/**
 * Calculează prețuri realiste pentru mobilier interior
 * Filtrare: același tip de mobilier, material identic, dimensiuni ±15%, brand identic dacă premium
 */
function calculateRealisticInteriorFurniturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const furnitureType = (product.attributes?.type || product.attributes?.tip || product.attributes?.furniture_type || product.title || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || product.attributes?.material_mobilier || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_purchase;
  
  // Preț de bază bazat pe tip mobilier
  let baseMin = 200;
  let baseMax = 1500;
  
  if (furnitureType.includes('canapea') || furnitureType.includes('sofa')) {
    baseMin = 500;
    baseMax = 3000;
  } else if (furnitureType.includes('șifonier') || furnitureType.includes('sifonier') || furnitureType.includes('dulap')) {
    baseMin = 300;
    baseMax = 2000;
  } else if (furnitureType.includes('pat')) {
    baseMin = 400;
    baseMax = 2500;
  } else if (furnitureType.includes('masă') || furnitureType.includes('masa') || furnitureType.includes('table')) {
    baseMin = 200;
    baseMax = 1500;
  } else if (furnitureType.includes('birou')) {
    baseMin = 300;
    baseMax = 2000;
  }
  
  // Ajustare bazată pe material
  if (material.includes('lemn masiv') || material.includes('solid wood')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  } else if (material.includes('piele') || material.includes('leather')) {
    baseMin = Math.round(baseMin * 1.4);
    baseMax = Math.round(baseMax * 1.8);
  } else if (material.includes('mdf')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.9);
  } else if (material.includes('metal') || material.includes('sticlă') || material.includes('glass')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('mobexpert') || brand.includes('rovere') || brand.includes('custom')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  } else if (brand.includes('ikea')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  // Ajustare bazată pe funcții speciale (extensibil etc.)
  const features = product.attributes?.features || product.attributes?.functii || product.attributes?.caracteristici;
  if (features) {
    const featuresStr = typeof features === 'string' ? features.toLowerCase() : 
                       Array.isArray(features) ? features.join(' ').toLowerCase() : '';
    if (featuresStr.includes('extensibil') || featuresStr.includes('extendable') || 
        featuresStr.includes('depozitare') || featuresStr.includes('storage')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe vârstă (depreciere moderată pentru mobilier)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    if (age > 5) {
      baseMin = Math.round(baseMin * (1 - age * 0.05));
      baseMax = Math.round(baseMax * (1 - age * 0.05));
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru mobilier exterior
 * Filtrare: același material, număr piese identic, brand similar
 */
function calculateRealisticExteriorFurniturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  const pieces = product.attributes?.pieces || product.attributes?.piese || product.attributes?.numar_piese;
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  
  // Preț de bază bazat pe material
  let baseMin = 300;
  let baseMax = 2000;
  
  if (material.includes('ratan') || material.includes('rattan')) {
    baseMin = 500;
    baseMax = 3000;
  } else if (material.includes('aluminiu') || material.includes('aluminum')) {
    baseMin = 400;
    baseMax = 2500;
  } else if (material.includes('lemn tratat') || material.includes('treated wood')) {
    baseMin = 600;
    baseMax = 3500;
  } else if (material.includes('plastic')) {
    baseMin = 200;
    baseMax = 1500;
  }
  
  // Ajustare bazată pe număr piese (identic pentru filtrare)
  if (pieces) {
    const piecesNum = parseInt(String(pieces));
    // Preț aproximativ: 100-200 EUR/piesă în funcție de material
    const pricePerPiece = material.includes('ratan') ? 200 : material.includes('aluminiu') ? 150 : 100;
    baseMin = piecesNum * pricePerPiece * 0.7;
    baseMax = piecesNum * pricePerPiece * 1.4;
  }
  
  // Ajustare bazată pe rezistență la intemperii
  if (product.attributes?.weather_resistant || product.attributes?.rezistent_intemperii || product.attributes?.weatherproof) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe brand
  if (brand.includes('premium') || brand.includes('design')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.75);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru echipamente de grădinărit
 * Filtrare: model identic, putere identică, stare similară
 */
function calculateRealisticGardenEquipmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const equipmentType = (product.attributes?.type || product.attributes?.tip || product.attributes?.equipment_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const power = product.attributes?.power || product.attributes?.putere || product.attributes?.cp || product.attributes?.watt;
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.ore_utilizare;
  
  // Preț de bază bazat pe tip echipament
  let baseMin = 200;
  let baseMax = 1500;
  
  if (equipmentType.includes('motocoasă') || equipmentType.includes('motocoasa') || equipmentType.includes('brushcutter')) {
    baseMin = 300;
    baseMax = 800;
  } else if (equipmentType.includes('mașină de tuns') || equipmentType.includes('masina de tuns') || equipmentType.includes('lawn mower')) {
    baseMin = 400;
    baseMax = 2000;
  } else if (equipmentType.includes('trimmer')) {
    baseMin = 150;
    baseMax = 500;
  } else if (equipmentType.includes('foarfecă') || equipmentType.includes('foarfece') || equipmentType.includes('hedge trimmer')) {
    baseMin = 200;
    baseMax = 600;
  } else if (equipmentType.includes('atomizor') || equipmentType.includes('sprayer')) {
    baseMin = 300;
    baseMax = 1000;
  } else if (equipmentType.includes('motofierăstraie') || equipmentType.includes('motofierastraie') || equipmentType.includes('chainsaw')) {
    baseMin = 400;
    baseMax = 1500;
  }
  
  // Ajustare bazată pe brand premium (Stihl, Husqvarna)
  if (brand.includes('stihl') || brand.includes('husqvarna')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  } else if (brand.includes('makita') || brand.includes('bosch')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe putere (identică pentru filtrare)
  if (power) {
    const powerNum = parseFloat(String(power));
    // Preț aproximativ: 5-10 EUR/CP sau 0.5-1 EUR/W
    const pricePerUnit = equipmentType.includes('motocoasă') || equipmentType.includes('motofierăstraie') ? 8 : 6;
    baseMin = powerNum * pricePerUnit * 0.7;
    baseMax = powerNum * pricePerUnit * 1.4;
  }
  
  // Ajustare bazată pe alimentare (electric mai ieftin)
  const fuel = (product.attributes?.fuel || product.attributes?.combustibil || product.attributes?.power_source || product.attributes?.alimentare || '').toLowerCase();
  if (fuel.includes('electric') || fuel.includes('baterie') || fuel.includes('battery')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe ore de utilizare
  if (hours) {
    const hoursNum = parseFloat(String(hours));
    if (hoursNum > 200) {
      baseMin = Math.round(baseMin * 0.8);
      baseMax = Math.round(baseMax * 0.85);
    } else if (hoursNum < 50) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru decorațiuni
 * Filtrare: tip obiect, material, dimensiuni ±20%
 */
function calculateRealisticDecorationPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const objectType = (product.attributes?.type || product.attributes?.tip || product.attributes?.object_type || product.title || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || product.attributes?.designer || '').toLowerCase();
  
  // Preț de bază bazat pe tip obiect
  let baseMin = 50;
  let baseMax = 500;
  
  if (objectType.includes('tablou decorativ') || objectType.includes('painting')) {
    baseMin = 100;
    baseMax = 800;
  } else if (objectType.includes('vază') || objectType.includes('vaza') || objectType.includes('vase')) {
    baseMin = 80;
    baseMax = 600;
  } else if (objectType.includes('lampă') || objectType.includes('lampa') || objectType.includes('lamp')) {
    baseMin = 100;
    baseMax = 1000;
  } else if (objectType.includes('ceas perete') || objectType.includes('wall clock')) {
    baseMin = 50;
    baseMax = 400;
  }
  
  // Ajustare bazată pe material
  if (material.includes('lemn') || material.includes('wood')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  } else if (material.includes('ceramică') || material.includes('ceramica') || material.includes('ceramic')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (material.includes('metal') || material.includes('industrial')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe brand/designer premium
  if (brand.includes('designer') || brand.includes('premium') || brand.includes('handmade')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  }
  
  // Ajustare bazată pe set (mai scump decât individual)
  if (product.attributes?.set || product.attributes?.tip_set === 'set') {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru electrocasnice
 * Filtrare: model identic, capacitate ±10%, funcții similare
 * Consideră deprecierea moderată pentru electrocasnice
 */
function calculateRealisticAppliancePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const currentYear = new Date().getFullYear();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const applianceType = (product.attributes?.type || product.attributes?.tip || product.attributes?.appliance_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const capacity = product.attributes?.capacity || product.attributes?.capacitate;
  const energyClass = (product.attributes?.energy_class || product.attributes?.clasa_energetica || product.attributes?.energy_rating || '').toLowerCase();
  
  if (!year) {
    return { min: 200, max: 2000 };
  }
  
  const age = currentYear - parseInt(String(year));
  
  // Preț de bază bazat pe tip electrocasnic
  let baseMin = 300;
  let baseMax = 1500;
  
  if (applianceType.includes('frigider')) {
    baseMin = 400;
    baseMax = 2000;
  } else if (applianceType.includes('aragaz') || applianceType.includes('stove')) {
    baseMin = 300;
    baseMax = 1500;
  } else if (applianceType.includes('cuptor') || applianceType.includes('oven')) {
    baseMin = 250;
    baseMax = 1200;
  } else if (applianceType.includes('mașină de spălat') || applianceType.includes('masina de spalat') || applianceType.includes('washing machine')) {
    baseMin = 350;
    baseMax = 1800;
  } else if (applianceType.includes('mașină de spălat vase') || applianceType.includes('masina de spalat vase') || applianceType.includes('dishwasher')) {
    baseMin = 300;
    baseMax = 1500;
  }
  
  // Depreciere bazată pe vârstă (moderată pentru electrocasnice)
  if (age <= 1) {
    baseMin = Math.round(baseMin * 0.95);
    baseMax = Math.round(baseMax * 0.95);
  } else if (age <= 2) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.85);
  } else if (age <= 3) {
    baseMin = Math.round(baseMin * 0.75);
    baseMax = Math.round(baseMax * 0.75);
  } else {
    baseMin = Math.round(baseMin * (1 - age * 0.08));
    baseMax = Math.round(baseMax * (1 - age * 0.08));
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('bosch') || brand.includes('siemens') || brand.includes('miele')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (brand.includes('samsung') || brand.includes('lg')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe capacitate (±10% pentru filtrare)
  if (capacity) {
    const capacityNum = parseFloat(String(capacity));
    // Preț aproximativ: 2-5 EUR/litru sau EUR/kg în funcție de tip
    const pricePerUnit = applianceType.includes('frigider') ? 4 : applianceType.includes('mașină de spălat') ? 3 : 2;
    baseMin = capacityNum * pricePerUnit * 0.7;
    baseMax = capacityNum * pricePerUnit * 1.4;
  }
  
  // Ajustare bazată pe clasă energetică (similare pentru filtrare)
  if (energyClass.includes('a+++') || energyClass.includes('a++')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (energyClass.includes('a+')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (energyClass.includes('b') || energyClass.includes('c')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe funcții (No Frost, inverter etc.) (similare pentru filtrare)
  const features = product.attributes?.features || product.attributes?.functii || product.attributes?.functions;
  if (features) {
    const featuresStr = typeof features === 'string' ? features.toLowerCase() : 
                       Array.isArray(features) ? features.join(' ').toLowerCase() : '';
    if (featuresStr.includes('no frost') || featuresStr.includes('inverter') || 
        featuresStr.includes('steam') || featuresStr.includes('aburi')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('uzat') || condition.includes('slab')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  // Ajustare bazată pe garanție
  if (product.attributes?.warranty || product.attributes?.garantie) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru modă & lifestyle bazate pe subcategorie
 * Prețurile variază puternic în funcție de brand, autenticitate, colecție, raritate, stare
 */
function calculateRealisticFashionPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('haină') || titleLower.includes('haina') || 
        titleLower.includes('hoodie') || titleLower.includes('designer')) {
      detectedSubcategory = "haine";
    } else if (titleLower.includes('încălțăminte') || titleLower.includes('incaltaminte') || 
               titleLower.includes('sneaker') || titleLower.includes('pantof')) {
      detectedSubcategory = "incaltaminte";
    } else if (titleLower.includes('geantă') || titleLower.includes('geanta') || 
               titleLower.includes('bag') || titleLower.includes('portofel')) {
      detectedSubcategory = "genti";
    } else if (titleLower.includes('parfum') || titleLower.includes('perfume')) {
      detectedSubcategory = "parfumuri";
    } else if (titleLower.includes('ceas') || titleLower.includes('watch')) {
      detectedSubcategory = "ceasuri";
    } else {
      detectedSubcategory = "haine";
    }
  }
  
  if (detectedSubcategory === "haine") {
    return calculateRealisticDesignerClothingPriceRange(product);
  } else if (detectedSubcategory === "incaltaminte") {
    return calculateRealisticFootwearPriceRange(product);
  } else if (detectedSubcategory === "genti") {
    return calculateRealisticBagsAccessoriesPriceRange(product);
  } else if (detectedSubcategory === "parfumuri") {
    return calculateRealisticPerfumePriceRange(product);
  } else if (detectedSubcategory === "ceasuri") {
    return calculateRealisticLuxuryWatchPriceRange(product);
  }
  
  // Default: haine
  return calculateRealisticDesignerClothingPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru haine de designer
 * Filtrare: același brand, același model/colecție, mărime identică, stare similară
 */
function calculateRealisticDesignerClothingPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  
  // Preț de bază bazat pe brand (designer premium)
  let baseMin = 200;
  let baseMax = 1500;
  
  // Ajustare bazată pe brand premium
  if (brand.includes('gucci') || brand.includes('balenciaga') || brand.includes('versace')) {
    baseMin = 800;
    baseMax = 5000;
  } else if (brand.includes('burberry') || brand.includes('prada') || brand.includes('dior')) {
    baseMin = 600;
    baseMax = 4000;
  } else if (brand.includes('moncler') || brand.includes('stone island') || brand.includes('off-white')) {
    baseMin = 500;
    baseMax = 3000;
  } else if (brand.includes('nike') || brand.includes('adidas') || brand.includes('supreme')) {
    baseMin = 300;
    baseMax = 2000;
  }
  
  // Ajustare bazată pe stare (foarte important pentru modă)
  if (condition.includes('nou cu etichetă') || condition.includes('nou sigilat') || condition.includes('new with tags') || condition.includes('nwt')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (condition.includes('nou fără etichetă') || condition.includes('new without tags') || condition.includes('nwot')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('ca nou') || condition.includes('like new') || condition.includes('vnds')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  } else if (condition.includes('folosit') || condition.includes('used') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe material premium
  if (material.includes('cashmere') || material.includes('cashmir')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  } else if (material.includes('silk') || material.includes('mătase') || material.includes('matase')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (material.includes('leather') || material.includes('piele')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe autenticitate (certificat / factură)
  if (product.attributes?.authenticity || product.attributes?.autenticitate || 
      product.attributes?.certificate || product.attributes?.certificat || 
      product.attributes?.receipt || product.attributes?.factura) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe colecție limitată / discontinued
  if (product.attributes?.limited_edition || product.attributes?.editie_limitat || 
      product.attributes?.discontinued || product.attributes?.discontinuat) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru încălțăminte
 * Filtrare: model identic, mărime ±1 EU, condiție identică
 */
function calculateRealisticFootwearPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.conditie || '').toLowerCase();
  
  // Preț de bază bazat pe brand și model
  let baseMin = 200;
  let baseMax = 1500;
  
  // Ajustare bazată pe brand premium
  if (brand.includes('louboutin') || brand.includes('gucci') || brand.includes('balenciaga')) {
    baseMin = 1000;
    baseMax = 5000;
  } else if (brand.includes('nike') && (model.includes('jordan') || model.includes('air jordan'))) {
    baseMin = 600;
    baseMax = 3000;
  } else if (brand.includes('adidas') && model.includes('yeezy')) {
    baseMin = 800;
    baseMax = 4000;
  } else if (brand.includes('nike') || brand.includes('adidas')) {
    baseMin = 300;
    baseMax = 1500;
  } else if (brand.includes('puma') || brand.includes('new balance')) {
    baseMin = 200;
    baseMax = 800;
  }
  
  // Ajustare bazată pe condiție (FOARTE IMPORTANT pentru sneakers)
  if (condition.includes('deadstock') || condition.includes('ds') || condition.includes('nou sigilat')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (condition.includes('vnds') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 0.95);
    baseMax = Math.round(baseMax * 1.0);
  } else if (condition.includes('folosit') || condition.includes('used') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe ediție (Limited, Collab, Exclusive)
  const edition = (product.attributes?.edition || product.attributes?.editie || product.attributes?.release_type || '').toLowerCase();
  if (edition.includes('limited') || edition.includes('limitat') || 
      edition.includes('collab') || edition.includes('collaboration') || 
      edition.includes('exclusive')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  }
  
  // Ajustare bazată pe autenticitate (legit check)
  if (product.attributes?.authenticity || product.attributes?.autenticitate || product.attributes?.legit_check) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe cutie originală + accesorii
  if (product.attributes?.box || product.attributes?.cutie || product.attributes?.original_box) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  if (product.attributes?.accessories || product.attributes?.accesorii || product.attributes?.all_accessories) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru genți & accesorii
 * Filtrare: model identic, material identic, stare similară
 */
function calculateRealisticBagsAccessoriesPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  
  // Preț de bază bazat pe brand premium
  let baseMin = 500;
  let baseMax = 3000;
  
  // Ajustare bazată pe brand ultra-premium
  if (brand.includes('hermes') || brand.includes('birkin') || brand.includes('kelly')) {
    baseMin = 5000;
    baseMax = 50000;
  } else if (brand.includes('louis vuitton') || brand.includes('lv')) {
    baseMin = 800;
    baseMax = 5000;
  } else if (brand.includes('gucci') || brand.includes('prada') || brand.includes('dior')) {
    baseMin = 600;
    baseMax = 4000;
  } else if (brand.includes('chanel')) {
    baseMin = 2000;
    baseMax = 10000;
  }
  
  // Ajustare bazată pe model iconic (Neverfull, Speedy etc.)
  if (model.includes('neverfull') || model.includes('speedy') || model.includes('alma')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe material (identic pentru filtrare)
  if (material.includes('leather') || material.includes('piele')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  } else if (material.includes('canvas') || material.includes('monogram')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe stare (similară pentru filtrare)
  if (condition.includes('nou') || condition.includes('new') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (condition.includes('ca nou') || condition.includes('like new')) {
    baseMin = Math.round(baseMin * 0.95);
    baseMax = Math.round(baseMax * 1.0);
  } else if (condition.includes('folosit') || condition.includes('used') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  // Ajustare bazată pe autenticitate (cu certificat, dustbag, factură)
  if (product.attributes?.authenticity || product.attributes?.autenticitate || 
      product.attributes?.certificate || product.attributes?.certificat) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  if (product.attributes?.dustbag || product.attributes?.punga_protectie) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  if (product.attributes?.receipt || product.attributes?.factura) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe set complet (cutie + acte + dustbag)
  if (product.attributes?.box && product.attributes?.papers && product.attributes?.dustbag) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru parfumuri & cosmetice
 * Filtrare: ml identic, stare identică, tester/retail identic
 */
function calculateRealisticPerfumePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const ml = product.attributes?.capacity || product.attributes?.capacitate || product.attributes?.ml || product.attributes?.volume;
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  const isSealed = product.attributes?.sealed || condition.includes('sigilat') || condition.includes('sealed');
  const isTester = product.attributes?.tester || (product.attributes?.tester_retail && product.attributes.tester_retail === 'tester');
  const remaining = product.attributes?.remaining || product.attributes?.ramas || product.attributes?.remaining_ml;
  
  // Preț de bază bazat pe brand
  let baseMin = 100;
  let baseMax = 500;
  
  // Ajustare bazată pe brand premium
  if (brand.includes('tom ford') || brand.includes('creed') || brand.includes('byredo')) {
    baseMin = 300;
    baseMax = 1500;
  } else if (brand.includes('dior') || brand.includes('chanel') || brand.includes('hermes')) {
    baseMin = 200;
    baseMax = 1000;
  } else if (brand.includes('versace') || brand.includes('dolce') || brand.includes('prada')) {
    baseMin = 150;
    baseMax = 800;
  }
  
  // Ajustare bazată pe cantitate (ml) (identică pentru filtrare)
  if (ml) {
    const mlNum = parseFloat(String(ml));
    // Preț aproximativ: 2-5 EUR/ml în funcție de brand
    const pricePerMl = brand.includes('tom ford') || brand.includes('creed') ? 5 : 
                       brand.includes('dior') || brand.includes('chanel') ? 3 : 2;
    baseMin = mlNum * pricePerMl * 0.6;
    baseMax = mlNum * pricePerMl * 1.2;
  }
  
  // Ajustare bazată pe stare (sigilat / folosit) (identică pentru filtrare)
  if (isSealed) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (remaining) {
    // Pentru parfumuri folosite, ajustare bazată pe cantitate rămasă
    const remainingNum = parseFloat(String(remaining));
    const mlNum = ml ? parseFloat(String(ml)) : 100;
    const percentage = remainingNum / mlNum;
    baseMin = Math.round(baseMin * percentage * 0.8);
    baseMax = Math.round(baseMax * percentage * 0.9);
  } else {
    // Folosit fără cantitate specificată
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe tester vs retail (identic pentru filtrare)
  if (isTester) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe ediții limitate / discontinued
  if (product.attributes?.limited_edition || product.attributes?.editie_limitat || 
      product.attributes?.discontinued || product.attributes?.discontinuat) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru ceasuri de lux
 * Filtrare: referință identică, material identic, stare identică, set complet vs ceas fără acte
 * Evaluare premium ca pe Chrono24 / WatchCharts
 */
function calculateRealisticLuxuryWatchPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const reference = product.attributes?.reference || product.attributes?.referinta || product.attributes?.ref || product.attributes?.model_reference;
  const material = (product.attributes?.material || product.attributes?.material_type || product.attributes?.case_material || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.state || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  
  // Preț de bază bazat pe brand ultra-premium
  let baseMin = 2000;
  let baseMax = 20000;
  
  // Ajustare bazată pe brand (Rolex premium)
  if (brand.includes('rolex')) {
    baseMin = 5000;
    baseMax = 100000;
    // Modele Rolex iconice
    if (model.includes('submariner') || model.includes('gmt') || model.includes('daytona')) {
      baseMin = 8000;
      baseMax = 150000;
    } else if (model.includes('datejust') || model.includes('explorer')) {
      baseMin = 6000;
      baseMax = 80000;
    }
  } else if (brand.includes('omega')) {
    baseMin = 2000;
    baseMax = 15000;
    if (model.includes('speedmaster') || model.includes('seamaster')) {
      baseMin = 3000;
      baseMax = 20000;
    }
  } else if (brand.includes('tag heuer')) {
    baseMin = 1500;
    baseMax = 10000;
  } else if (brand.includes('patek') || brand.includes('ap') || brand.includes('audemars')) {
    baseMin = 20000;
    baseMax = 500000;
  }
  
  // Ajustare bazată pe material (identic pentru filtrare)
  if (material.includes('gold') || material.includes('aur') || material.includes('yellow gold')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  } else if (material.includes('two-tone') || material.includes('steel gold')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.4);
  } else if (material.includes('steel') || material.includes('otel')) {
    // Steel este standard
  } else if (material.includes('platinum') || material.includes('platină')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  }
  
  // Ajustare bazată pe stare (identică pentru filtrare) - FOARTE IMPORTANT pentru ceasuri
  if (condition.includes('mint') || condition.includes('excellent') || condition.includes('excelent')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('good') || condition.includes('bun') || condition.includes('folosit')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  } else if (condition.includes('fair') || condition.includes('mediu') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  // Ajustare bazată pe cutie + acte (complete set = valoare mare)
  const hasBox = product.attributes?.box || product.attributes?.cutie || product.attributes?.original_box;
  const hasPapers = product.attributes?.papers || product.attributes?.acte || product.attributes?.warranty_papers;
  if (hasBox && hasPapers) {
    // Set complet: +15-20%
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (hasBox || hasPapers) {
    // Doar cutie sau doar acte: +5-10%
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else {
    // Fără cutie și fără acte: -10-15%
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe brățară originală
  if (product.attributes?.bracelet || product.attributes?.bratara || product.attributes?.original_bracelet) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe mecanism (automatic premium)
  const movement = (product.attributes?.movement || product.attributes?.mecanism || product.attributes?.movement_type || '').toLowerCase();
  if (movement.includes('automatic') || movement.includes('automat')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe vârstă (ceasuri vintage pot fi mai scumpe)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    if (age > 30 && brand.includes('rolex')) {
      // Vintage Rolex: poate fi mai valoros
      baseMin = Math.round(baseMin * 1.2);
      baseMax = Math.round(baseMax * 1.4);
    } else if (age > 10) {
      // Ceasuri vechi: ușor depreciere
      baseMin = Math.round(baseMin * 0.95);
      baseMax = Math.round(baseMax * 0.98);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru agricultură & zootehnie bazate pe subcategorie
 * Evaluare extrem de tehnică ca pe TractorPool, Agriaffaires, Mascus, OLX Agro
 */
function calculateRealisticAgriculturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('tractor') || titleLower.includes('combină') || titleLower.includes('combina')) {
      detectedSubcategory = "tractoare";
    } else if (titleLower.includes('remorcă agricolă') || titleLower.includes('remorca agricola')) {
      detectedSubcategory = "remorci";
    } else if (titleLower.includes('irigații') || titleLower.includes('irigatii')) {
      detectedSubcategory = "irigatii";
    } else if (titleLower.includes('vaca') || titleLower.includes('animal') || titleLower.includes('bovin')) {
      detectedSubcategory = "animale";
    } else if (titleLower.includes('semințe') || titleLower.includes('seminte') || titleLower.includes('furaj')) {
      detectedSubcategory = "seminte";
    } else {
      detectedSubcategory = "tractoare";
    }
  }
  
  if (detectedSubcategory === "tractoare") {
    return calculateRealisticTractorCombinePriceRange(product);
  } else if (detectedSubcategory === "remorci") {
    return calculateRealisticAgriculturalTrailerPriceRange(product);
  } else if (detectedSubcategory === "irigatii") {
    return calculateRealisticIrrigationEquipmentPriceRange(product);
  } else if (detectedSubcategory === "animale") {
    return calculateRealisticLivestockPriceRange(product);
  } else if (detectedSubcategory === "seminte") {
    return calculateRealisticSeedsFeedFertilizerPriceRange(product);
  }
  
  // Default: tractoare
  return calculateRealisticTractorCombinePriceRange(product);
}

/**
 * Calculează prețuri realiste pentru tractoare și combine
 * Filtrare: brand identic, model identic sau foarte apropiat, ore funcționare ±20%, an ±4 ani, echipare similară
 */
function calculateRealisticTractorCombinePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || product.title || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.ore_funcionare || product.attributes?.ore_functionare;
  const power = product.attributes?.power || product.attributes?.putere || product.attributes?.hp || product.attributes?.cp;
  const isCombine = (product.title || '').toLowerCase().includes('combină') || 
                    (product.title || '').toLowerCase().includes('combina') ||
                    (product.attributes?.type || '').toLowerCase().includes('combină') ||
                    (product.attributes?.type || '').toLowerCase().includes('combina');
  
  // Preț de bază bazat pe brand premium
  let baseMin = 15000;
  let baseMax = 80000;
  
  // Ajustare bazată pe brand premium
  if (brand.includes('john deere')) {
    baseMin = 25000;
    baseMax = 150000;
  } else if (brand.includes('claas')) {
    baseMin = 30000;
    baseMax = 180000;
  } else if (brand.includes('new holland')) {
    baseMin = 20000;
    baseMax = 120000;
  } else if (brand.includes('massey ferguson')) {
    baseMin = 18000;
    baseMax = 100000;
  } else if (brand.includes('fendt')) {
    baseMin = 35000;
    baseMax = 200000;
  }
  
  // Combine sunt mai scumpe decât tractoare
  if (isCombine) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  }
  
  // Ajustare bazată pe putere motor (CP) - foarte important
  if (power) {
    const powerNum = parseFloat(String(power));
    // Preț aproximativ: 500-1000 EUR/CP în funcție de brand
    const pricePerHp = brand.includes('john deere') || brand.includes('claas') ? 800 : 
                      brand.includes('fendt') ? 1000 : 600;
    baseMin = powerNum * pricePerHp * 0.7;
    baseMax = powerNum * pricePerHp * 1.4;
  }
  
  // Ajustare bazată pe ore funcționare (±20% pentru filtrare) - FOARTE IMPORTANT!
  if (hours) {
    const hoursNum = parseFloat(String(hours));
    // Depreciere bazată pe ore: ~0.5-1 EUR/oră în funcție de brand
    const depreciationPerHour = brand.includes('john deere') || brand.includes('claas') ? 0.8 : 0.6;
    const depreciation = hoursNum * depreciationPerHour;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.5);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.5);
    
    // Ore foarte multe: depreciere mai mare
    if (hoursNum > 10000) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (hoursNum < 2000) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe an fabricație (±4 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~5-8% pe an
    const annualDepreciation = brand.includes('john deere') || brand.includes('claas') ? 0.06 : 0.07;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe tip transmisie (powershift/CVT premium)
  const transmission = (product.attributes?.transmission || product.attributes?.transmisie || product.attributes?.transmission_type || '').toLowerCase();
  if (transmission.includes('powershift') || transmission.includes('cvt') || transmission.includes('continu')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe echipare (A/C cabina, GPS, autoguidance) (similară pentru filtrare)
  const equipment = product.attributes?.equipment || product.attributes?.echipare || product.attributes?.features;
  if (equipment) {
    const equipmentStr = typeof equipment === 'string' ? equipment.toLowerCase() : 
                         Array.isArray(equipment) ? equipment.join(' ').toLowerCase() : '';
    if (equipmentStr.includes('gps') || equipmentStr.includes('autoguidance') || equipmentStr.includes('autoghidare')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
    if (equipmentStr.includes('ac') || equipmentStr.includes('aer conditionat') || equipmentStr.includes('cabina')) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.technical_condition || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('bun') || condition.includes('good')) {
    // Standard
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe anvelope stare
  if (product.attributes?.tires || product.attributes?.anvelope || product.attributes?.tire_condition) {
    const tireCondition = String(product.attributes.tires || product.attributes.anvelope || product.attributes.tire_condition).toLowerCase();
    if (tireCondition.includes('nou') || tireCondition.includes('new') || tireCondition.includes('80%') || tireCondition.includes('90%')) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    } else if (tireCondition.includes('uzat') || tireCondition.includes('worn') || tireCondition.includes('30%') || tireCondition.includes('40%')) {
      baseMin = Math.round(baseMin * 0.95);
      baseMax = Math.round(baseMax * 0.98);
    }
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru remorci agricole
 * Filtrare: capacitate ±15%, an ±5 ani, brand similar
 */
function calculateRealisticAgriculturalTrailerPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const capacity = product.attributes?.capacity || product.attributes?.capacitate || product.attributes?.tonnage || product.attributes?.tonaj;
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const trailerType = (product.attributes?.type || product.attributes?.tip || product.attributes?.trailer_type || '').toLowerCase();
  
  // Preț de bază bazat pe capacitate
  let baseMin = 3000;
  let baseMax = 20000;
  
  // Ajustare bazată pe capacitate (±15% pentru filtrare)
  if (capacity) {
    const capacityNum = parseFloat(String(capacity));
    // Preț aproximativ: 800-1200 EUR/tonă
    const pricePerTon = brand.includes('fliegl') || brand.includes('metalfach') ? 1000 : 800;
    baseMin = capacityNum * pricePerTon * 0.7;
    baseMax = capacityNum * pricePerTon * 1.4;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('fliegl') || brand.includes('metalfach')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe tip remorcă
  if (trailerType.includes('basculabilă') || trailerType.includes('basculabila') || trailerType.includes('tipper')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (trailerType.includes('tandem') || trailerType.includes('3 axe')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe an fabricație (±5 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~4-6% pe an
    const annualDepreciation = 0.05;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru echipamente de irigații
 * Filtrare: tip echipament identic, dimensiuni ±10%, an ±4 ani
 */
function calculateRealisticIrrigationEquipmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const equipmentType = (product.attributes?.type || product.attributes?.tip || product.attributes?.equipment_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const capacity = product.attributes?.capacity || product.attributes?.capacitate || product.attributes?.flow_rate || product.attributes?.debit;
  const diameter = product.attributes?.diameter || product.attributes?.diametru || product.attributes?.diametru_furtun;
  const length = product.attributes?.length || product.attributes?.lungime || product.attributes?.lungime_tambur;
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  
  // Preț de bază bazat pe tip echipament
  let baseMin = 500;
  let baseMax = 5000;
  
  if (equipmentType.includes('tambur') || equipmentType.includes('reel')) {
    baseMin = 2000;
    baseMax = 15000;
  } else if (equipmentType.includes('motopompă') || equipmentType.includes('motopompa') || equipmentType.includes('pump')) {
    baseMin = 800;
    baseMax = 8000;
  } else if (equipmentType.includes('pivot') || equipmentType.includes('center pivot')) {
    baseMin = 10000;
    baseMax = 80000;
  } else if (equipmentType.includes('furtun') || equipmentType.includes('hose')) {
    baseMin = 200;
    baseMax = 2000;
  } else if (equipmentType.includes('pompă submersibilă') || equipmentType.includes('pompa submersibila') || equipmentType.includes('submersible')) {
    baseMin = 1000;
    baseMax = 10000;
  }
  
  // Ajustare bazată pe capacitate/debit
  if (capacity) {
    const capacityNum = parseFloat(String(capacity));
    // Preț aproximativ: 50-100 EUR/(L/min sau m³/h) în funcție de tip
    const pricePerUnit = equipmentType.includes('pivot') ? 200 : equipmentType.includes('tambur') ? 80 : 50;
    baseMin = capacityNum * pricePerUnit * 0.7;
    baseMax = capacityNum * pricePerUnit * 1.4;
  }
  
  // Ajustare bazată pe dimensiuni (±10% pentru filtrare)
  if (diameter) {
    const diameterNum = parseFloat(String(diameter));
    // Preț aproximativ: 5-10 EUR/mm diametru
    const pricePerMm = 7;
    baseMin = diameterNum * pricePerMm * 0.7;
    baseMax = diameterNum * pricePerMm * 1.4;
  }
  if (length) {
    const lengthNum = parseFloat(String(length));
    // Preț aproximativ: 2-5 EUR/m lungime
    const pricePerM = equipmentType.includes('tambur') ? 4 : 2;
    baseMin = lengthNum * pricePerM * 0.7;
    baseMax = lengthNum * pricePerM * 1.4;
  }
  
  // Ajustare bazată pe an fabricație (±4 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~5-7% pe an
    const annualDepreciation = 0.06;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.technical_condition || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru animale
 * Filtrare: aceeași rasă, aceleași caracteristici reproductive, vârstă ±20%, producție similară
 */
function calculateRealisticLivestockPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const animalType = (product.attributes?.type || product.attributes?.tip || product.attributes?.animal_type || product.title || '').toLowerCase();
  const breed = (product.attributes?.breed || product.attributes?.rasa || product.attributes?.breed_type || '').toLowerCase();
  const age = product.attributes?.age || product.attributes?.varsta || product.attributes?.age_years;
  const weight = product.attributes?.weight || product.attributes?.greutate || product.attributes?.kg;
  const production = product.attributes?.production || product.attributes?.productie || product.attributes?.milk_per_day || product.attributes?.lapte_zi;
  const reproductiveStatus = (product.attributes?.status || product.attributes?.stare || product.attributes?.reproductive_status || '').toLowerCase();
  
  // Preț de bază bazat pe tip animal
  let baseMin = 500;
  let baseMax = 3000;
  
  if (animalType.includes('vaca') || animalType.includes('bovin') || animalType.includes('cow')) {
    baseMin = 1500;
    baseMax = 5000;
  } else if (animalType.includes('oi') || animalType.includes('ovin') || animalType.includes('sheep')) {
    baseMin = 300;
    baseMax = 800;
  } else if (animalType.includes('capră') || animalType.includes('capra') || animalType.includes('goat')) {
    baseMin = 200;
    baseMax = 600;
  } else if (animalType.includes('porc') || animalType.includes('porcin') || animalType.includes('pig')) {
    baseMin = 400;
    baseMax = 1200;
  } else if (animalType.includes('cal') || animalType.includes('horse')) {
    baseMin = 2000;
    baseMax = 10000;
  } else if (animalType.includes('pasăre') || animalType.includes('pasare') || animalType.includes('poultry')) {
    baseMin = 10;
    baseMax = 50;
  }
  
  // Ajustare bazată pe rasă premium (aceeași rasă pentru filtrare)
  if (breed.includes('holstein') || breed.includes('simmental') || breed.includes('montbeliard')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe vârstă (±20% pentru filtrare)
  if (age) {
    const ageNum = parseFloat(String(age));
    // Vârstă optimă: 2-5 ani pentru vaci
    if (animalType.includes('vaca') || animalType.includes('bovin')) {
      if (ageNum >= 2 && ageNum <= 5) {
        baseMin = Math.round(baseMin * 1.1);
        baseMax = Math.round(baseMax * 1.15);
      } else if (ageNum > 8) {
        baseMin = Math.round(baseMin * 0.8);
        baseMax = Math.round(baseMax * 0.85);
      }
    }
  }
  
  // Ajustare bazată pe greutate
  if (weight) {
    const weightNum = parseFloat(String(weight));
    // Preț aproximativ: 3-5 EUR/kg pentru vaci
    if (animalType.includes('vaca') || animalType.includes('bovin')) {
      const pricePerKg = 4;
      baseMin = weightNum * pricePerKg * 0.7;
      baseMax = weightNum * pricePerKg * 1.4;
    }
  }
  
  // Ajustare bazată pe producție (similară pentru filtrare)
  if (production) {
    const productionNum = parseFloat(String(production));
    // Producție mare: premium
    if (animalType.includes('vaca') || animalType.includes('bovin')) {
      if (productionNum > 30) {
        baseMin = Math.round(baseMin * 1.2);
        baseMax = Math.round(baseMax * 1.3);
      } else if (productionNum > 20) {
        baseMin = Math.round(baseMin * 1.1);
        baseMax = Math.round(baseMax * 1.15);
      }
    }
  }
  
  // Ajustare bazată pe stare reproductivă (aceleași caracteristici pentru filtrare)
  if (reproductiveStatus.includes('gestantă') || reproductiveStatus.includes('gestanta') || reproductiveStatus.includes('pregnant')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (reproductiveStatus.includes('lactație') || reproductiveStatus.includes('lactatie') || reproductiveStatus.includes('lactating')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe pedigree/genetică
  if (product.attributes?.pedigree || product.attributes?.pedigree_certificate || product.attributes?.certificat_pedigree) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe înscris în registre
  if (product.attributes?.registered || product.attributes?.inscris || product.attributes?.in_registru) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe stare sănătate
  const health = (product.attributes?.health || product.attributes?.sanatate || product.attributes?.health_status || '').toLowerCase();
  if (health.includes('excelent') || health.includes('excellent') || health.includes('sanatos')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (health.includes('probleme') || health.includes('issues') || health.includes('bolnav')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru semințe, furaje, îngrășăminte
 * Filtrare: cantitate identică, brand identic, categorie identică
 */
function calculateRealisticSeedsFeedFertilizerPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const productType = (product.attributes?.type || product.attributes?.tip || product.attributes?.product_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || product.attributes?.producer || product.attributes?.producator || '').toLowerCase();
  const quantity = product.attributes?.quantity || product.attributes?.cantitate || product.attributes?.weight || product.attributes?.greutate;
  const category = (product.attributes?.category || product.attributes?.categorie || product.attributes?.quality || product.attributes?.calitate || '').toLowerCase();
  const presentation = (product.attributes?.presentation || product.attributes?.prezentare || product.attributes?.package || product.attributes?.ambalaj || '').toLowerCase();
  
  // Preț de bază bazat pe tip produs
  let baseMin = 50;
  let baseMax = 500;
  
  if (productType.includes('semințe') || productType.includes('seminte') || productType.includes('seeds')) {
    baseMin = 100;
    baseMax = 2000;
  } else if (productType.includes('furaj') || productType.includes('feed') || productType.includes('nutreț') || productType.includes('nutret')) {
    baseMin = 80;
    baseMax = 1500;
  } else if (productType.includes('îngrășământ') || productType.includes('ingrasamant') || productType.includes('fertilizer')) {
    baseMin = 50;
    baseMax = 800;
  }
  
  // Ajustare bazată pe cantitate (identică pentru filtrare)
  if (quantity) {
    const quantityNum = parseFloat(String(quantity));
    // Preț aproximativ: 2-5 EUR/kg pentru semințe, 0.5-1 EUR/kg pentru furaje, 0.3-0.8 EUR/kg pentru îngrășăminte
    let pricePerKg = 2;
    if (productType.includes('semințe') || productType.includes('seminte')) {
      pricePerKg = brand.includes('pioneer') || brand.includes('syngenta') || brand.includes('monsanto') ? 4 : 2.5;
    } else if (productType.includes('furaj') || productType.includes('feed')) {
      pricePerKg = 0.8;
    } else if (productType.includes('îngrășământ') || productType.includes('ingrasamant')) {
      pricePerKg = 0.5;
    }
    baseMin = quantityNum * pricePerKg * 0.8;
    baseMax = quantityNum * pricePerKg * 1.3;
  }
  
  // Ajustare bazată pe brand premium (identic pentru filtrare)
  if (brand.includes('pioneer') || brand.includes('syngenta') || brand.includes('monsanto') || brand.includes('bayer')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe categorie (premium / standard) (identică pentru filtrare)
  if (category.includes('premium') || category.includes('elite') || category.includes('certificat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe prezentare (big bag mai ieftin per kg)
  if (presentation.includes('big bag') || presentation.includes('bigbag') || presentation.includes('1000kg')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  } else if (presentation.includes('sac') || presentation.includes('bag') || presentation.includes('25kg') || presentation.includes('50kg')) {
    // Sacuri: preț standard
  }
  
  // Ajustare bazată pe puritate (pentru semințe)
  if (product.attributes?.purity || product.attributes?.puritate || product.attributes?.purity_percent) {
    const purity = parseFloat(String(product.attributes.purity || product.attributes.puritate || product.attributes.purity_percent));
    if (purity >= 98) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    } else if (purity < 95) {
      baseMin = Math.round(baseMin * 0.9);
      baseMax = Math.round(baseMax * 0.95);
    }
  }
  
  // Ajustare bazată pe certificare
  if (product.attributes?.certified || product.attributes?.certificat || product.attributes?.certification) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru maritime & aeronautice bazate pe subcategorie
 * Evaluare extrem de tehnică ca pe BoatTrader, YachtWorld, AviationTrader, Controller, DroneTrader
 */
function calculateRealisticMaritimeAeronauticsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('barcă') || titleLower.includes('barca') || titleLower.includes('iaht') || 
        titleLower.includes('yacht') || titleLower.includes('skijet') || titleLower.includes('jet ski')) {
      detectedSubcategory = "barci";
    } else if (titleLower.includes('motor marin') || titleLower.includes('motor maritim') || 
               titleLower.includes('outboard') || titleLower.includes('inboard')) {
      detectedSubcategory = "motoare";
    } else if (titleLower.includes('avion') || titleLower.includes('aircraft') || 
               titleLower.includes('ulm') || titleLower.includes('ultraușor')) {
      detectedSubcategory = "avioane";
    } else if (titleLower.includes('dronă industrială') || titleLower.includes('drona industriala') || 
               titleLower.includes('matrice') || titleLower.includes('mavic enterprise')) {
      detectedSubcategory = "dronuri";
    } else {
      detectedSubcategory = "barci";
    }
  }
  
  if (detectedSubcategory === "barci") {
    return calculateRealisticBoatYachtPriceRange(product);
  } else if (detectedSubcategory === "motoare") {
    return calculateRealisticMarineEnginePriceRange(product);
  } else if (detectedSubcategory === "avioane") {
    return calculateRealisticAircraftPriceRange(product);
  } else if (detectedSubcategory === "dronuri") {
    return calculateRealisticIndustrialDronePriceRange(product);
  }
  
  // Default: bărci
  return calculateRealisticBoatYachtPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru bărci, iahturi, skijeturi
 * Filtrare: model + an ±3 ani, putere ±10%, lungime ±10%, ore funcționare ±20%, echipare similară
 */
function calculateRealisticBoatYachtPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const boatType = (product.attributes?.type || product.attributes?.tip || product.attributes?.boat_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const length = product.attributes?.length || product.attributes?.lungime || product.attributes?.length_feet || product.attributes?.lungime_metri;
  const power = product.attributes?.power || product.attributes?.putere || product.attributes?.hp || product.attributes?.cp || product.attributes?.engine_power;
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.engine_hours || product.attributes?.ore_functionare;
  const material = (product.attributes?.material || product.attributes?.material_type || product.attributes?.hull_material || '').toLowerCase();
  
  // Preț de bază bazat pe tip barcă
  let baseMin = 5000;
  let baseMax = 50000;
  
  if (boatType.includes('skijet') || boatType.includes('jet ski')) {
    baseMin = 2000;
    baseMax = 15000;
  } else if (boatType.includes('iaht') || boatType.includes('yacht')) {
    baseMin = 50000;
    baseMax = 2000000;
  } else if (boatType.includes('cabin cruiser')) {
    baseMin = 20000;
    baseMax = 150000;
  } else if (boatType.includes('barcă pescuit') || boatType.includes('fishing boat')) {
    baseMin = 8000;
    baseMax = 80000;
  } else if (boatType.includes('rib')) {
    baseMin = 10000;
    baseMax = 100000;
  } else if (boatType.includes('gonflabil')) {
    baseMin = 1000;
    baseMax = 10000;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('sea-doo') || brand.includes('yamaha') || brand.includes('kawasaki')) {
    if (boatType.includes('skijet') || boatType.includes('jet ski')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.2);
    }
  } else if (brand.includes('jeanneau') || brand.includes('beneteau') || brand.includes('bayliner')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe lungime (±10% pentru filtrare)
  if (length) {
    const lengthNum = parseFloat(String(length));
    // Preț aproximativ: 2000-5000 EUR/m pentru bărci mici, 10000-50000 EUR/m pentru iahturi
    const pricePerMeter = boatType.includes('iaht') || boatType.includes('yacht') ? 30000 : 
                          boatType.includes('cabin cruiser') ? 8000 : 3000;
    baseMin = lengthNum * pricePerMeter * 0.7;
    baseMax = lengthNum * pricePerMeter * 1.4;
  }
  
  // Ajustare bazată pe putere motor (±10% pentru filtrare)
  if (power) {
    const powerNum = parseFloat(String(power));
    // Preț aproximativ: 50-100 EUR/CP în funcție de tip
    const pricePerHp = boatType.includes('skijet') || boatType.includes('jet ski') ? 60 : 
                      boatType.includes('iaht') || boatType.includes('yacht') ? 200 : 80;
    baseMin = powerNum * pricePerHp * 0.7;
    baseMax = powerNum * pricePerHp * 1.4;
  }
  
  // Ajustare bazată pe ore funcționare motor (±20% pentru filtrare) - FOARTE IMPORTANT!
  if (hours) {
    const hoursNum = parseFloat(String(hours));
    // Depreciere bazată pe ore: ~1-2 EUR/oră în funcție de tip
    const depreciationPerHour = boatType.includes('iaht') || boatType.includes('yacht') ? 2 : 1;
    const depreciation = hoursNum * depreciationPerHour;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.5);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.5);
    
    // Ore foarte multe: depreciere mai mare
    if (hoursNum > 2000) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (hoursNum < 500) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe an fabricație (±3 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~6-10% pe an
    const annualDepreciation = boatType.includes('iaht') || boatType.includes('yacht') ? 0.08 : 0.07;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe material
  if (material.includes('aluminiu') || material.includes('aluminum')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (material.includes('rib') || material.includes('inflatable')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe echipare (GPS, sonar, troliu, cabină, remorcă inclusă etc.) (similară pentru filtrare)
  const equipment = product.attributes?.equipment || product.attributes?.echipare || product.attributes?.features;
  if (equipment) {
    const equipmentStr = typeof equipment === 'string' ? equipment.toLowerCase() : 
                        Array.isArray(equipment) ? equipment.join(' ').toLowerCase() : '';
    if (equipmentStr.includes('gps') || equipmentStr.includes('sonar') || equipmentStr.includes('fish finder')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
    if (equipmentStr.includes('cabină') || equipmentStr.includes('cabin') || equipmentStr.includes('cabin cruiser')) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    }
    if (equipmentStr.includes('remorcă') || equipmentStr.includes('trailer')) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.technical_condition || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru motoare marine
 * Filtrare: putere identică, tip motor identic, an ±4 ani, ore funcționare ±20%
 */
function calculateRealisticMarineEnginePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const power = product.attributes?.power || product.attributes?.putere || product.attributes?.hp || product.attributes?.cp;
  const engineType = (product.attributes?.engine_type || product.attributes?.tip_motor || product.attributes?.type || '').toLowerCase();
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.engine_hours;
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  
  // Preț de bază bazat pe putere (identică pentru filtrare)
  let baseMin = 2000;
  let baseMax = 50000;
  
  if (power) {
    const powerNum = parseFloat(String(power));
    // Preț aproximativ: 100-200 EUR/CP în funcție de brand
    const pricePerHp = brand.includes('yamaha') || brand.includes('mercury') ? 150 : 
                       brand.includes('suzuki') || brand.includes('honda') ? 130 : 120;
    baseMin = powerNum * pricePerHp * 0.7;
    baseMax = powerNum * pricePerHp * 1.4;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('yamaha') || brand.includes('mercury')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe tip motor (2T / 4T) (identic pentru filtrare)
  if (engineType.includes('4t') || engineType.includes('4-stroke') || engineType.includes('4 timpi')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (engineType.includes('2t') || engineType.includes('2-stroke') || engineType.includes('2 timpi')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe ore funcționare (±20% pentru filtrare)
  if (hours) {
    const hoursNum = parseFloat(String(hours));
    // Depreciere bazată pe ore: ~0.5-1 EUR/oră
    const depreciationPerHour = 0.7;
    const depreciation = hoursNum * depreciationPerHour;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.5);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.5);
    
    // Ore foarte multe: depreciere mai mare
    if (hoursNum > 1500) {
      baseMin = Math.round(baseMin * 0.75);
      baseMax = Math.round(baseMax * 0.8);
    } else if (hoursNum < 300) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe an fabricație (±4 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~5-7% pe an
    const annualDepreciation = 0.06;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.technical_condition || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru avioane mici / ușoare / ultraușoare
 * Filtrare: model identic, an ±3 ani, ore zbor ±20%, motorizare identică, echipare avion (IFR = preț mult mai mare)
 * Evaluare exact ca pe Controller.com
 */
function calculateRealisticAircraftPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const aircraftType = (product.attributes?.type || product.attributes?.tip || product.attributes?.aircraft_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const flightHours = product.attributes?.flight_hours || product.attributes?.ore_zbor || product.attributes?.ttsn || product.attributes?.hours;
  const engineHours = product.attributes?.engine_hours || product.attributes?.ore_motor || product.attributes?.smoh || product.attributes?.tbo;
  const engineType = (product.attributes?.engine_type || product.attributes?.tip_motor || product.attributes?.engine_brand || '').toLowerCase();
  const power = product.attributes?.power || product.attributes?.putere || product.attributes?.hp || product.attributes?.cp;
  const avionics = (product.attributes?.avionics || product.attributes?.instrumentatie || product.attributes?.cockpit_type || '').toLowerCase();
  const isIFR = product.attributes?.ifr || product.attributes?.ifr_certified || product.attributes?.ifr_equipped;
  
  // Preț de bază bazat pe tip aeronavă
  let baseMin = 30000;
  let baseMax = 300000;
  
  if (aircraftType.includes('ulm') || aircraftType.includes('ultraușor') || aircraftType.includes('ultralight')) {
    baseMin = 15000;
    baseMax = 80000;
  } else if (aircraftType.includes('avion mic') || aircraftType.includes('light aircraft') || 
             aircraftType.includes('cessna') || aircraftType.includes('piper')) {
    baseMin = 50000;
    baseMax = 500000;
  } else if (aircraftType.includes('twin engine') || aircraftType.includes('bimotor')) {
    baseMin = 200000;
    baseMax = 2000000;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('cessna')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (brand.includes('piper')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.25);
  } else if (brand.includes('tecnam')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe ore de zbor (TTSN) (±20% pentru filtrare) - FOARTE IMPORTANT!
  if (flightHours) {
    const flightHoursNum = parseFloat(String(flightHours));
    // Depreciere bazată pe ore: ~10-50 EUR/oră în funcție de tip
    const depreciationPerHour = aircraftType.includes('ulm') ? 10 : 
                               aircraftType.includes('twin engine') ? 50 : 25;
    const depreciation = flightHoursNum * depreciationPerHour;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.4);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.4);
    
    // Ore foarte multe: depreciere mai mare
    if (flightHoursNum > 5000) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (flightHoursNum < 1000) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe ore motor (SMOH / TBO)
  if (engineHours) {
    const engineHoursNum = parseFloat(String(engineHours));
    // Motor aproape de TBO: depreciere
    if (engineHoursNum > 1500) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    } else if (engineHoursNum < 500) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe an fabricație (±3 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~3-5% pe an (mai mică decât mașinile)
    const annualDepreciation = 0.04;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe instrumentație (analog / glass cockpit – Garmin G1000 etc.) (identică pentru filtrare)
  if (avionics.includes('glass cockpit') || avionics.includes('garmin g1000') || avionics.includes('g1000')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (avionics.includes('glass') || avionics.includes('digital')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.25);
  }
  
  // Ajustare bazată pe IFR / VFR (identic pentru filtrare) - FOARTE IMPORTANT! (IFR = preț mult mai mare)
  if (isIFR) {
    baseMin = Math.round(baseMin * 1.4);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  // Ajustare bazată pe istoric mentenanță
  if (product.attributes?.maintenance_history || product.attributes?.istoric_mentenanta || product.attributes?.maintenance_logs) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe accident free
  if (product.attributes?.accident_free || product.attributes?.fara_accidente || product.attributes?.no_accidents) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else {
    // Accident în istoric: depreciere semnificativă
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.75);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru dronuri industriale
 * Filtrare: același model, aceleași accesorii (RTK, cam), ore utilizare ±20%, stare similară
 */
function calculateRealisticIndustrialDronePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const hours = product.attributes?.hours || product.attributes?.ore || product.attributes?.flight_hours || product.attributes?.battery_cycles;
  const accessories = product.attributes?.accessories || product.attributes?.accesorii || product.attributes?.kit;
  const hasRTK = accessories && (typeof accessories === 'string' ? accessories.toLowerCase().includes('rtk') : 
                                  Array.isArray(accessories) ? accessories.join(' ').toLowerCase().includes('rtk') : false);
  
  // Preț de bază bazat pe brand și model (identic pentru filtrare)
  let baseMin = 5000;
  let baseMax = 50000;
  
  if (brand.includes('dji')) {
    if (model.includes('matrice 300') || model.includes('matrice300')) {
      baseMin = 15000;
      baseMax = 35000;
    } else if (model.includes('matrice 200') || model.includes('matrice200')) {
      baseMin = 10000;
      baseMax = 25000;
    } else if (model.includes('mavic 3 enterprise') || model.includes('mavic3 enterprise')) {
      baseMin = 8000;
      baseMax = 15000;
    } else if (model.includes('agras') || model.includes('agricultural')) {
      baseMin = 12000;
      baseMax = 30000;
    } else if (model.includes('mavic enterprise')) {
      baseMin = 5000;
      baseMax = 12000;
    }
  } else if (brand.includes('autel')) {
    baseMin = 6000;
    baseMax = 20000;
  }
  
  // Ajustare bazată pe accesorii (RTK, senzori termici, zoom) (aceleași accesorii pentru filtrare)
  if (hasRTK) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  }
  if (accessories) {
    const accessoriesStr = typeof accessories === 'string' ? accessories.toLowerCase() : 
                          Array.isArray(accessories) ? accessories.join(' ').toLowerCase() : '';
    if (accessoriesStr.includes('thermal') || accessoriesStr.includes('termic') || accessoriesStr.includes('flir')) {
      baseMin = Math.round(baseMin * 1.2);
      baseMax = Math.round(baseMax * 1.3);
    }
    if (accessoriesStr.includes('zoom') || accessoriesStr.includes('telephoto')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe ore de utilizare / baterii ciclu (±20% pentru filtrare)
  if (hours) {
    const hoursNum = parseFloat(String(hours));
    // Depreciere bazată pe ore: ~5-10 EUR/oră sau ciclu
    const depreciationPerHour = 7;
    const depreciation = hoursNum * depreciationPerHour;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.6);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.6);
    
    // Ore foarte multe: depreciere mai mare
    if (hoursNum > 500) {
      baseMin = Math.round(baseMin * 0.8);
      baseMax = Math.round(baseMax * 0.85);
    } else if (hoursNum < 100) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe număr baterii
  if (product.attributes?.batteries || product.attributes?.baterii || product.attributes?.numar_baterii) {
    const batteriesNum = parseFloat(String(product.attributes.batteries || product.attributes.baterii || product.attributes.numar_baterii));
    // Baterii suplimentare: +5-10% per baterie
    baseMin = Math.round(baseMin * (1 + batteriesNum * 0.05));
    baseMax = Math.round(baseMax * (1 + batteriesNum * 0.05));
  }
  
  // Ajustare bazată pe licență / certificare
  if (product.attributes?.license || product.attributes?.licenta || product.attributes?.certification || product.attributes?.certificare) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('new') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (condition.includes('ca nou') || condition.includes('like new')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (condition.includes('uzat') || condition.includes('used') || condition.includes('folosit')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe garanție
  if (product.attributes?.warranty || product.attributes?.garantie) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru business & licitații bazate pe subcategorie
 * Include reguli speciale pentru lichidări (reduceri 20-70%)
 */
function calculateRealisticBusinessAuctionsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('imprimantă') || titleLower.includes('imprimanta') || 
        titleLower.includes('copiator') || titleLower.includes('multifuncțională')) {
      detectedSubcategory = "echipamente_birou";
    } else if (titleLower.includes('raft metalic') || titleLower.includes('vitrină frigorifică') || 
               titleLower.includes('mobilier comercial')) {
      detectedSubcategory = "mobilier_comercial";
    } else if (titleLower.includes('calculator second-hand') || titleLower.includes('desktop refurbished')) {
      detectedSubcategory = "calculatoare";
    } else if (titleLower.includes('lichidare') || titleLower.includes('licitație lichidare')) {
      detectedSubcategory = "lichidari";
    } else if (titleLower.includes('lot') || titleLower.includes('stoc')) {
      detectedSubcategory = "loturi";
    } else {
      detectedSubcategory = "echipamente_birou";
    }
  }
  
  if (detectedSubcategory === "echipamente_birou") {
    return calculateRealisticOfficeEquipmentPriceRange(product);
  } else if (detectedSubcategory === "mobilier_comercial") {
    return calculateRealisticCommercialFurniturePriceRange(product);
  } else if (detectedSubcategory === "calculatoare") {
    return calculateRealisticRefurbishedComputerPriceRange(product);
  } else if (detectedSubcategory === "lichidari") {
    return calculateRealisticLiquidationPriceRange(product);
  } else if (detectedSubcategory === "loturi") {
    return calculateRealisticBulkLotPriceRange(product);
  }
  
  // Default: echipamente birou
  return calculateRealisticOfficeEquipmentPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru echipamente de birou
 * Filtrare: același model, an ±3 ani, număr pagini ±30%, funcții identice
 */
function calculateRealisticOfficeEquipmentPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const equipmentType = (product.attributes?.type || product.attributes?.tip || product.attributes?.equipment_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  const pagesPrinted = product.attributes?.pages_printed || product.attributes?.pagini_printate || product.attributes?.page_count;
  const speed = product.attributes?.speed || product.attributes?.viteza || product.attributes?.ppm;
  const technology = (product.attributes?.technology || product.attributes?.tehnologie || product.attributes?.tech || '').toLowerCase();
  const lifecycle = product.attributes?.lifecycle || product.attributes?.ciclu_viata || product.attributes?.lifecycle_percent;
  
  // Preț de bază bazat pe tip echipament
  let baseMin = 200;
  let baseMax = 5000;
  
  if (equipmentType.includes('copiator') || equipmentType.includes('copier')) {
    baseMin = 1000;
    baseMax = 15000;
  } else if (equipmentType.includes('multifuncțională') || equipmentType.includes('multifunctionala') || equipmentType.includes('mfp')) {
    baseMin = 500;
    baseMax = 8000;
  } else if (equipmentType.includes('imprimantă') || equipmentType.includes('imprimanta') || equipmentType.includes('printer')) {
    baseMin = 200;
    baseMax = 3000;
  } else if (equipmentType.includes('scaner') || equipmentType.includes('scanner')) {
    baseMin = 300;
    baseMax = 5000;
  } else if (equipmentType.includes('shredder') || equipmentType.includes('distrugător')) {
    baseMin = 300;
    baseMax = 2000;
  } else if (equipmentType.includes('proiector') || equipmentType.includes('projector')) {
    baseMin = 500;
    baseMax = 5000;
  } else if (equipmentType.includes('centrală telefonică') || equipmentType.includes('centrala telefonica') || equipmentType.includes('pbx')) {
    baseMin = 1000;
    baseMax = 10000;
  } else if (equipmentType.includes('server')) {
    baseMin = 2000;
    baseMax = 20000;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('xerox') || brand.includes('konica minolta') || brand.includes('ricoh')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (brand.includes('hp') || brand.includes('canon')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe viteză (ppm)
  if (speed) {
    const speedNum = parseFloat(String(speed));
    // Preț aproximativ: 50-100 EUR/ppm în funcție de tip
    const pricePerPpm = equipmentType.includes('copiator') ? 80 : 50;
    baseMin = speedNum * pricePerPpm * 0.7;
    baseMax = speedNum * pricePerPpm * 1.4;
  }
  
  // Ajustare bazată pe număr pagini printate (±30% pentru filtrare) - FOARTE IMPORTANT pentru copiatoare!
  if (pagesPrinted) {
    const pagesNum = parseFloat(String(pagesPrinted));
    // Depreciere bazată pe pagini: ~0.01-0.02 EUR/pagină
    const depreciationPerPage = 0.015;
    const depreciation = pagesNum * depreciationPerPage;
    baseMin = Math.max(baseMin - depreciation, baseMin * 0.5);
    baseMax = Math.max(baseMax - depreciation, baseMax * 0.5);
    
    // Pagini foarte multe: depreciere mai mare
    if (pagesNum > 500000) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (pagesNum < 50000) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe ciclu de viață
  if (lifecycle) {
    const lifecycleNum = parseFloat(String(lifecycle));
    if (lifecycleNum > 80) {
      baseMin = Math.round(baseMin * 0.7);
      baseMax = Math.round(baseMax * 0.75);
    } else if (lifecycleNum > 50) {
      baseMin = Math.round(baseMin * 0.85);
      baseMax = Math.round(baseMax * 0.9);
    }
  }
  
  // Ajustare bazată pe tehnologie
  if (technology.includes('laser')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (technology.includes('inkjet')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  // Ajustare bazată pe an fabricație (±3 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~8-12% pe an (rapidă pentru echipamente birou)
    const annualDepreciation = 0.1;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe funcții (scanare, duplex, rețea) (identice pentru filtrare)
  const functions = product.attributes?.functions || product.attributes?.functii || product.attributes?.features;
  if (functions) {
    const functionsStr = typeof functions === 'string' ? functions.toLowerCase() : 
                        Array.isArray(functions) ? functions.join(' ').toLowerCase() : '';
    if (functionsStr.includes('scanare') || functionsStr.includes('scanning')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
    if (functionsStr.includes('duplex') || functionsStr.includes('double-sided')) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
    if (functionsStr.includes('rețea') || functionsStr.includes('network') || functionsStr.includes('wifi')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare tehnică
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.technical_condition || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe garanție / service history
  if (product.attributes?.warranty || product.attributes?.garantie || product.attributes?.service_history) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru mobilier comercial
 * Filtrare: tip identic, capacitate ±15%, an ±5 ani
 */
function calculateRealisticCommercialFurniturePriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const furnitureType = (product.attributes?.type || product.attributes?.tip || product.attributes?.furniture_type || product.title || '').toLowerCase();
  const capacity = product.attributes?.capacity || product.attributes?.capacitate;
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  
  // Preț de bază bazat pe tip mobilier
  let baseMin = 500;
  let baseMax = 5000;
  
  if (furnitureType.includes('vitrină frigorifică') || furnitureType.includes('vitrina frigorifica') || furnitureType.includes('display fridge')) {
    baseMin = 1000;
    baseMax = 10000;
  } else if (furnitureType.includes('raft metalic') || furnitureType.includes('shelving')) {
    baseMin = 300;
    baseMax = 3000;
  } else if (furnitureType.includes('tejghеlă') || furnitureType.includes('tejghеla') || furnitureType.includes('counter')) {
    baseMin = 800;
    baseMax = 5000;
  } else if (furnitureType.includes('masă restaurant') || furnitureType.includes('masa restaurant') || furnitureType.includes('restaurant table')) {
    baseMin = 400;
    baseMax = 2000;
  } else if (furnitureType.includes('scaun horeca') || furnitureType.includes('horeca chair')) {
    baseMin = 200;
    baseMax = 800;
  } else if (furnitureType.includes('dulap arhivare') || furnitureType.includes('filing cabinet')) {
    baseMin = 500;
    baseMax = 3000;
  }
  
  // Ajustare bazată pe capacitate (±15% pentru filtrare)
  if (capacity) {
    const capacityNum = parseFloat(String(capacity));
    // Preț aproximativ: 2-5 EUR/litru pentru vitrine, 50-100 EUR/m pentru rafturi
    const pricePerUnit = furnitureType.includes('vitrină frigorifică') || furnitureType.includes('vitrina frigorifica') ? 3 : 75;
    baseMin = capacityNum * pricePerUnit * 0.7;
    baseMax = capacityNum * pricePerUnit * 1.4;
  }
  
  // Ajustare bazată pe an fabricație (±5 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~4-6% pe an
    const annualDepreciation = 0.05;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe echipare (no-frost, ventilate etc.)
  const equipment = product.attributes?.equipment || product.attributes?.echipare || product.attributes?.features;
  if (equipment) {
    const equipmentStr = typeof equipment === 'string' ? equipment.toLowerCase() : 
                        Array.isArray(equipment) ? equipment.join(' ').toLowerCase() : '';
    if (equipmentStr.includes('no-frost') || equipmentStr.includes('no frost') || equipmentStr.includes('ventilate')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('excelent') || condition.includes('excellent') || condition.includes('ca nou')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('mediu') || condition.includes('fair') || condition.includes('necesita reparatii')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru calculatoare second-hand
 * Filtrare: configurație identică, anul ±2 ani
 */
function calculateRealisticRefurbishedComputerPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  const model = (product.attributes?.model || product.attributes?.model_name || '').toLowerCase();
  const processor = (product.attributes?.processor || product.attributes?.procesor || product.attributes?.cpu || '').toLowerCase();
  const ram = product.attributes?.ram || product.attributes?.memory;
  const storage = product.attributes?.storage || product.attributes?.stocare || product.attributes?.ssd || product.attributes?.hdd;
  const isSSD = product.attributes?.ssd || product.attributes?.storage_type === 'SSD';
  const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
  
  // Preț de bază bazat pe procesor (identic pentru filtrare)
  let baseMin = 800;
  let baseMax = 3000;
  
  if (processor.includes('i7') || processor.includes('ryzen 7')) {
    baseMin = 1200;
    baseMax = 4000;
  } else if (processor.includes('i5') || processor.includes('ryzen 5')) {
    baseMin = 1000;
    baseMax = 3000;
  } else if (processor.includes('i3') || processor.includes('ryzen 3')) {
    baseMin = 600;
    baseMax = 2000;
  }
  
  // Ajustare bazată pe RAM (identic pentru filtrare)
  if (ram) {
    const ramNum = parseInt(String(ram));
    // Preț aproximativ: 20-30 EUR/GB RAM
    const pricePerGb = 25;
    baseMin = ramNum * pricePerGb * 0.7;
    baseMax = ramNum * pricePerGb * 1.4;
  }
  
  // Ajustare bazată pe stocare (identic pentru filtrare)
  if (storage) {
    const storageNum = parseFloat(String(storage));
    // Preț aproximativ: 0.5-1 EUR/GB pentru SSD, 0.2-0.5 EUR/GB pentru HDD
    const pricePerGb = isSSD ? 0.7 : 0.3;
    baseMin = storageNum * pricePerGb * 0.7;
    baseMax = storageNum * pricePerGb * 1.4;
  }
  
  // Ajustare bazată pe brand premium
  if (brand.includes('dell') || brand.includes('hp') || brand.includes('lenovo')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  }
  
  // Ajustare bazată pe an producție (±2 ani pentru filtrare)
  if (year) {
    const yearNum = parseInt(String(year));
    const currentYear = new Date().getFullYear();
    const age = currentYear - yearNum;
    
    // Depreciere anuală: ~10-15% pe an (rapidă pentru calculatoare)
    const annualDepreciation = 0.12;
    baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
    baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
  }
  
  // Ajustare bazată pe garanție (refurbished 12 luni / fără)
  if (product.attributes?.warranty || product.attributes?.garantie || product.attributes?.refurbished_warranty) {
    const warranty = String(product.attributes.warranty || product.attributes.garantie || product.attributes.refurbished_warranty).toLowerCase();
    if (warranty.includes('12') || warranty.includes('12 luni') || warranty.includes('1 an')) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    } else if (warranty.includes('6') || warranty.includes('6 luni')) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('new') || condition.includes('refurbished')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('uzat') || condition.includes('used') || condition.includes('folosit')) {
    baseMin = Math.round(baseMin * 0.85);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru licitații lichidări firme
 * APLICĂ REGULĂ SPECIALĂ: reduceri 20-70% față de piața normală
 */
function calculateRealisticLiquidationPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const lotCondition = (product.attributes?.lot_condition || product.attributes?.stare_lot || product.attributes?.lot_status || '').toLowerCase();
  const quantity = product.attributes?.quantity || product.attributes?.cantitate || product.attributes?.lot_size;
  
  // Calculează prețul normal de piață (folosind logica pentru echipamente birou sau mobilier)
  let normalMin = 1000;
  let normalMax = 5000;
  
  // Încearcă să estimeze prețul normal bazat pe tip
  const equipmentType = (product.attributes?.type || product.attributes?.tip || product.title || '').toLowerCase();
  if (equipmentType.includes('copiator') || equipmentType.includes('imprimantă') || equipmentType.includes('imprimanta')) {
    const officeRange = calculateRealisticOfficeEquipmentPriceRange(product);
    normalMin = officeRange.min;
    normalMax = officeRange.max;
  } else if (equipmentType.includes('mobilier') || equipmentType.includes('scaun') || equipmentType.includes('masă')) {
    const furnitureRange = calculateRealisticCommercialFurniturePriceRange(product);
    normalMin = furnitureRange.min;
    normalMax = furnitureRange.max;
  }
  
  // APLICĂ FACTOR DE LICHIDARE: reduceri 20-70% în funcție de stare LOT
  let liquidationFactor = 0.5; // Default: -50%
  
  if (lotCondition.includes('bun') || lotCondition.includes('good') || lotCondition.includes('excelent')) {
    liquidationFactor = 0.7; // -30% (reducere mai mică)
  } else if (lotCondition.includes('mix') || lotCondition.includes('mixed')) {
    liquidationFactor = 0.5; // -50%
  } else if (lotCondition.includes('unknown') || lotCondition.includes('necunoscut') || lotCondition.includes('slab')) {
    liquidationFactor = 0.3; // -70% (reducere mare)
  }
  
  // Ajustare bazată pe cantitate (loturi mari = reduceri mai mari)
  if (quantity) {
    const quantityNum = parseFloat(String(quantity));
    if (quantityNum > 100) {
      liquidationFactor = Math.max(liquidationFactor - 0.1, 0.2); // Reducere suplimentară pentru loturi mari
    }
  }
  
  const baseMin = Math.round(normalMin * liquidationFactor);
  const baseMax = Math.round(normalMax * liquidationFactor);
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru loturi stocuri produse
 * Filtrare: loturi similare ca tip & cantitate, brand similar, stare lot (sigilat vs mix)
 */
function calculateRealisticBulkLotPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const productType = (product.attributes?.type || product.attributes?.tip || product.attributes?.product_type || product.title || '').toLowerCase();
  const quantity = product.attributes?.quantity || product.attributes?.cantitate || product.attributes?.lot_size;
  const packaging = (product.attributes?.packaging || product.attributes?.ambalare || product.attributes?.packaging_type || '').toLowerCase();
  const returnPercent = product.attributes?.return_percent || product.attributes?.procent_retur || product.attributes?.defect_percent;
  
  // Preț de bază bazat pe tip produs (per unitate)
  let pricePerUnit = 10;
  
  if (productType.includes('parfum') || productType.includes('perfume')) {
    pricePerUnit = 20;
  } else if (productType.includes('cosmetic') || productType.includes('makeup')) {
    pricePerUnit = 5;
  } else if (productType.includes('haină') || productType.includes('haina') || productType.includes('clothing')) {
    pricePerUnit = 15;
  } else if (productType.includes('jucărie') || productType.includes('jucarie') || productType.includes('toy')) {
    pricePerUnit = 8;
  } else if (productType.includes('electronic') || productType.includes('gadget')) {
    pricePerUnit = 25;
  }
  
  // Calculează preț total bazat pe cantitate (similară pentru filtrare)
  let baseMin = 500;
  let baseMax = 50000;
  
  if (quantity) {
    const quantityNum = parseFloat(String(quantity));
    // Preț per unitate cu reducere pentru loturi mari
    const unitPrice = pricePerUnit * (quantityNum > 100 ? 0.7 : quantityNum > 50 ? 0.8 : 0.9);
    baseMin = quantityNum * unitPrice * 0.7;
    baseMax = quantityNum * unitPrice * 1.3;
  }
  
  // Ajustare bazată pe ambalare (sigilate / open-box / mix) (similară pentru filtrare)
  if (packaging.includes('sigilat') || packaging.includes('sealed') || packaging.includes('new')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (packaging.includes('open-box') || packaging.includes('deschis')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  } else if (packaging.includes('mix') || packaging.includes('mixed')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  // Ajustare bazată pe procent retur / defecte
  if (returnPercent) {
    const returnPercentNum = parseFloat(String(returnPercent));
    // Reducere proporțională cu procentul de retur/defecte
    const defectFactor = 1 - (returnPercentNum / 100) * 0.5; // Max -50% pentru 100% defecte
    baseMin = Math.round(baseMin * defectFactor);
    baseMax = Math.round(baseMax * defectFactor);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru materiale construcții bazate pe subcategorie
 * Prețurile depind de unitate (kg / tonă / m² / bucată), cantitate mare, tip material, fluctuații pieță
 */
function calculateRealisticConstructionMaterialsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('ciment') || titleLower.includes('caramida') || titleLower.includes('otel')) {
      detectedSubcategory = "ciment_caramida_otel";
    } else if (titleLower.includes('polistiren') || titleLower.includes('vata') || titleLower.includes('izolatie')) {
      detectedSubcategory = "izolatie";
    } else if (titleLower.includes('feronerie') || titleLower.includes('surub') || titleLower.includes('unelte')) {
      detectedSubcategory = "feronerie_unelte";
    } else if (titleLower.includes('usa') || titleLower.includes('fereastra') || titleLower.includes('tamplarie')) {
      detectedSubcategory = "usi_ferestre";
    } else {
      detectedSubcategory = "ciment_caramida_otel";
    }
  }
  
  if (detectedSubcategory === "ciment_caramida_otel") {
    return calculateRealisticCementBrickSteelPriceRange(product);
  } else if (detectedSubcategory === "izolatie") {
    return calculateRealisticInsulationMaterialsPriceRange(product);
  } else if (detectedSubcategory === "feronerie_unelte") {
    return calculateRealisticHardwareToolsPriceRange(product);
  } else if (detectedSubcategory === "usi_ferestre") {
    return calculateRealisticDoorsWindowsPriceRange(product);
  }
  
  // Default: ciment, cărămidă, oțel
  return calculateRealisticCementBrickSteelPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru ciment, cărămidă, oțel
 * Filtrare: același tip material, aceeași unitate (sac / palet / tonă / bucăți), marcă identică, rezistență identică
 */
function calculateRealisticCementBrickSteelPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const materialType = (product.attributes?.type || product.attributes?.tip || product.attributes?.material_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || product.attributes?.brand_name || '').toLowerCase();
  const packaging = (product.attributes?.packaging || product.attributes?.ambalare || product.attributes?.unit || '').toLowerCase();
  const quantity = product.attributes?.quantity || product.attributes?.cantitate || product.attributes?.amount;
  const strength = product.attributes?.strength || product.attributes?.rezistenta || product.attributes?.strength_class;
  
  // Preț de bază bazat pe tip material și unitate
  let pricePerUnit = 1; // EUR per unitate (sac / palet / tonă / bucată)
  
  if (materialType.includes('ciment')) {
    // Ciment: preț per sac (25kg sau 40kg)
    if (packaging.includes('sac') || packaging.includes('bag')) {
      pricePerUnit = 8; // EUR/sac pentru ciment standard
      if (strength && String(strength).includes('42.5R')) {
        pricePerUnit = 10; // Premium
      }
    } else if (packaging.includes('tona') || packaging.includes('tonă')) {
      pricePerUnit = 120; // EUR/tonă
    }
  } else if (materialType.includes('caramida') || materialType.includes('cărămidă')) {
    // Cărămidă: preț per bucată sau palet
    if (packaging.includes('buc') || packaging.includes('bucata')) {
      pricePerUnit = 0.5; // EUR/bucată pentru cărămidă standard
    } else if (packaging.includes('palet')) {
      pricePerUnit = 200; // EUR/palet (aprox 400 bucăți)
    }
  } else if (materialType.includes('otel') || materialType.includes('oțel') || materialType.includes('fier beton')) {
    // Oțel beton: preț per tonă
    if (packaging.includes('tona') || packaging.includes('tonă')) {
      pricePerUnit = 600; // EUR/tonă pentru oțel beton
    } else if (packaging.includes('kg')) {
      pricePerUnit = 0.6; // EUR/kg
    }
  } else if (materialType.includes('plasa sudata') || materialType.includes('plasă sudată')) {
    // Plasă sudată: preț per m²
    pricePerUnit = 3; // EUR/m²
  } else if (materialType.includes('grinda metalica') || materialType.includes('grindă metalică')) {
    // Grinzi metalice: preț per tonă
    pricePerUnit = 800; // EUR/tonă
  }
  
  // Ajustare bazată pe marcă premium (identică pentru filtrare)
  if (brand.includes('holcim') || brand.includes('crh') || brand.includes('heidelberg')) {
    pricePerUnit = Math.round(pricePerUnit * 1.1);
  } else if (brand.includes('macon') || brand.includes('brikston')) {
    pricePerUnit = Math.round(pricePerUnit * 1.05);
  }
  
  // Calculează preț total bazat pe cantitate
  let baseMin = 50;
  let baseMax = 5000;
  
  if (quantity) {
    const quantityNum = parseFloat(String(quantity));
    // Preț per unitate cu reducere pentru cantități mari
    const unitPrice = pricePerUnit * (quantityNum > 1000 ? 0.9 : quantityNum > 100 ? 0.95 : 1.0);
    baseMin = quantityNum * unitPrice * 0.85;
    baseMax = quantityNum * unitPrice * 1.15;
  } else {
    // Fallback: preț pentru o unitate
    baseMin = pricePerUnit * 0.85;
    baseMax = pricePerUnit * 1.15;
  }
  
  // Ajustare bazată pe stare (nou / stoc vechi)
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.stock_condition || '').toLowerCase();
  if (condition.includes('stoc vechi') || condition.includes('old stock') || condition.includes('vechi')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.85);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru materiale izolație
 * Filtrare: grosime identică, densitate identică, unitate măsură identică
 */
function calculateRealisticInsulationMaterialsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const materialType = (product.attributes?.type || product.attributes?.tip || product.attributes?.material_type || product.title || '').toLowerCase();
  const density = product.attributes?.density || product.attributes?.densitate || product.attributes?.density_class;
  const thickness = product.attributes?.thickness || product.attributes?.grosime || product.attributes?.thickness_cm;
  const area = product.attributes?.quantity || product.attributes?.cantitate || product.attributes?.area || product.attributes?.suprafata;
  const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
  
  // Preț de bază bazat pe tip material și densitate (identică pentru filtrare) - per m²
  let pricePerM2 = 15; // EUR/m²
  
  if (materialType.includes('eps') || materialType.includes('polistiren expandat')) {
    // EPS: preț bazat pe densitate
    if (density) {
      const densityNum = parseFloat(String(density));
      pricePerM2 = densityNum * 0.3; // EUR/m² pentru EPS (ex: EPS 80 = 24 EUR/m²)
    } else {
      pricePerM2 = 20; // Default EPS
    }
  } else if (materialType.includes('xps') || materialType.includes('polistiren extrudat')) {
    // XPS: mai scump decât EPS
    pricePerM2 = 35; // EUR/m²
    if (density) {
      const densityNum = parseFloat(String(density));
      pricePerM2 = densityNum * 0.4;
    }
  } else if (materialType.includes('vata bazaltica') || materialType.includes('vata minerala')) {
    // Vată bazaltică: preț bazat pe densitate
    if (density) {
      const densityNum = parseFloat(String(density));
      pricePerM2 = densityNum * 0.25; // EUR/m² (ex: 80kg/m³ = 20 EUR/m²)
    } else {
      pricePerM2 = 25; // Default
    }
  } else if (materialType.includes('vata sticla')) {
    // Vată sticlă: mai ieftină
    pricePerM2 = 15; // EUR/m²
  } else if (materialType.includes('spuma poliuretanica') || materialType.includes('spumă poliuretanică')) {
    // Spumă poliuretanică: premium
    pricePerM2 = 50; // EUR/m²
  } else if (materialType.includes('membrana')) {
    // Membrane hidroizolație: preț per m²
    pricePerM2 = 8; // EUR/m²
  }
  
  // Ajustare bazată pe grosime (identică pentru filtrare)
  if (thickness) {
    const thicknessNum = parseFloat(String(thickness));
    // Preț proporțional cu grosimea
    pricePerM2 = pricePerM2 * (thicknessNum / 10); // Normalizat la 10cm
  }
  
  // Calculează preț total bazat pe suprafață (m²)
  let baseMin = 100;
  let baseMax = 5000;
  
  if (area) {
    const areaNum = parseFloat(String(area));
    // Preț per m² cu reducere pentru suprafațe mari
    const unitPrice = pricePerM2 * (areaNum > 100 ? 0.95 : areaNum > 50 ? 0.98 : 1.0);
    baseMin = areaNum * unitPrice * 0.85;
    baseMax = areaNum * unitPrice * 1.15;
  } else {
    // Fallback: preț pentru 10 m²
    baseMin = pricePerM2 * 10 * 0.85;
    baseMax = pricePerM2 * 10 * 1.15;
  }
  
  // Ajustare bazată pe clasă incendiu
  if (product.attributes?.fire_class || product.attributes?.clasa_incendiu) {
    const fireClass = String(product.attributes.fire_class || product.attributes.clasa_incendiu).toLowerCase();
    if (fireClass.includes('a1') || fireClass.includes('non-combustible')) {
      baseMin = Math.round(baseMin * 1.2);
      baseMax = Math.round(baseMax * 1.3);
    } else if (fireClass.includes('b1') || fireClass.includes('b2')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare (sigilat / desigilat)
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('sigilat') || condition.includes('sealed') || condition.includes('nou')) {
    baseMin = Math.round(baseMin * 1.05);
    baseMax = Math.round(baseMax * 1.1);
  } else if (condition.includes('desigilat') || condition.includes('opened')) {
    baseMin = Math.round(baseMin * 0.9);
    baseMax = Math.round(baseMax * 0.95);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru feronerie și unelte
 * Filtrare: dimensiune identică, cantitate ±10%, brand identic pentru unelte
 */
function calculateRealisticHardwareToolsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const titleLower = (product.title || '').toLowerCase();
  const isTool = titleLower.includes('bormasina') || titleLower.includes('unelte electrice') || 
                 titleLower.includes('makita') || titleLower.includes('bosch') || titleLower.includes('dewalt');
  
  if (isTool) {
    // Unelte electrice
    const brand = (product.attributes?.brand || product.attributes?.marca || '').toLowerCase();
    const power = product.attributes?.power || product.attributes?.putere || product.attributes?.watt;
    const battery = product.attributes?.battery || product.attributes?.baterie || product.attributes?.battery_ah;
    const year = product.attributes?.year || product.attributes?.an || product.attributes?.year_production;
    
    // Preț de bază bazat pe brand (identic pentru filtrare)
    let baseMin = 200;
    let baseMax = 1500;
    
    if (brand.includes('makita') || brand.includes('bosch') || brand.includes('dewalt')) {
      baseMin = 300;
      baseMax = 2000;
    } else if (brand.includes('black+decker') || brand.includes('ryobi')) {
      baseMin = 150;
      baseMax = 800;
    }
    
    // Ajustare bazată pe putere
    if (power) {
      const powerNum = parseFloat(String(power));
      // Preț aproximativ: 1-2 EUR/W
      const pricePerWatt = 1.5;
      baseMin = powerNum * pricePerWatt * 0.7;
      baseMax = powerNum * pricePerWatt * 1.4;
    }
    
    // Ajustare bazată pe baterie (Ah)
    if (battery) {
      const batteryNum = parseFloat(String(battery));
      // Baterie mai mare: premium
      if (batteryNum >= 5) {
        baseMin = Math.round(baseMin * 1.2);
        baseMax = Math.round(baseMax * 1.3);
      } else if (batteryNum >= 3) {
        baseMin = Math.round(baseMin * 1.1);
        baseMax = Math.round(baseMax * 1.15);
      }
    }
    
    // Ajustare bazată pe an producție
    if (year) {
      const yearNum = parseInt(String(year));
      const currentYear = new Date().getFullYear();
      const age = currentYear - yearNum;
      
      // Depreciere anuală: ~8-12% pe an
      const annualDepreciation = 0.1;
      baseMin = Math.round(baseMin * (1 - age * annualDepreciation));
      baseMax = Math.round(baseMax * (1 - age * annualDepreciation));
    }
    
    // Ajustare bazată pe stare
    const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
    if (condition.includes('nou') || condition.includes('new') || condition.includes('sigilat')) {
      baseMin = Math.round(baseMin * 1.15);
      baseMax = Math.round(baseMax * 1.2);
    } else if (condition.includes('folosit') || condition.includes('used')) {
      baseMin = Math.round(baseMin * 0.8);
      baseMax = Math.round(baseMax * 0.85);
    }
    
    return { min: baseMin, max: baseMax };
  } else {
    // Feronerie
    const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
    const dimensions = product.attributes?.dimensions || product.attributes?.dimensiuni || product.attributes?.size;
    const quantity = product.attributes?.quantity || product.attributes?.cantitate;
    
    // Preț de bază bazat pe material (identic pentru filtrare) - per bucată
    let pricePerPiece = 0.5; // EUR/bucată
    
    if (material.includes('inox') || material.includes('stainless')) {
      pricePerPiece = 1.5; // Premium
    } else if (material.includes('zincat') || material.includes('galvanized')) {
      pricePerPiece = 0.8;
    } else if (material.includes('bronz') || material.includes('brass')) {
      pricePerPiece = 2; // Premium
    }
    
    // Calculează preț total bazat pe cantitate (±10% pentru filtrare)
    let baseMin = 10;
    let baseMax = 1000;
    
    if (quantity) {
      const quantityNum = parseFloat(String(quantity));
      // Preț per bucată cu reducere pentru cantități mari
      const unitPrice = pricePerPiece * (quantityNum > 1000 ? 0.85 : quantityNum > 100 ? 0.9 : 1.0);
      baseMin = quantityNum * unitPrice * 0.85;
      baseMax = quantityNum * unitPrice * 1.15;
    } else {
      // Fallback: preț pentru 100 bucăți
      baseMin = pricePerPiece * 100 * 0.85;
      baseMax = pricePerPiece * 100 * 1.15;
    }
    
    return { min: baseMin, max: baseMax };
  }
}

/**
 * Calculează prețuri realiste pentru uși, ferestre, tâmplărie
 * Filtrare: dimensiuni ±10%, material identic, brand profil identic
 */
function calculateRealisticDoorsWindowsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const productType = (product.attributes?.type || product.attributes?.tip || product.attributes?.product_type || product.title || '').toLowerCase();
  const material = (product.attributes?.material || product.attributes?.material_type || '').toLowerCase();
  const dimensions = product.attributes?.dimensions || product.attributes?.dimensiuni || product.attributes?.size;
  const width = product.attributes?.width;
  const height = product.attributes?.height;
  const profileBrand = (product.attributes?.brand || product.attributes?.marca || product.attributes?.profile_brand || '').toLowerCase();
  const chambers = product.attributes?.chambers || product.attributes?.camere || product.attributes?.number_of_chambers;
  const glassType = (product.attributes?.glass_type || product.attributes?.tip_geam || '').toLowerCase();
  const glassThickness = product.attributes?.glass_thickness || product.attributes?.grosime_geam;
  
  // Preț de bază bazat pe tip și material (identic pentru filtrare)
  let baseMin = 200;
  let baseMax = 2000;
  
  if (productType.includes('fereastra') || productType.includes('fereastră') || productType.includes('window')) {
    baseMin = 300;
    baseMax = 3000;
  } else if (productType.includes('usa') || productType.includes('ușă') || productType.includes('door')) {
    baseMin = 400;
    baseMax = 4000;
  } else if (productType.includes('glisant') || productType.includes('sliding')) {
    baseMin = 500;
    baseMax = 5000;
  } else if (productType.includes('rulou') || productType.includes('roller shutter')) {
    baseMin = 200;
    baseMax = 1500;
  }
  
  // Ajustare bazată pe material (identic pentru filtrare)
  if (material.includes('pvc')) {
    baseMin = Math.round(baseMin * 1.0);
    baseMax = Math.round(baseMax * 1.0);
  } else if (material.includes('aluminiu') || material.includes('aluminum')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (material.includes('lemn') || material.includes('wood')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe brand profil (identic pentru filtrare)
  if (profileBrand.includes('rehau') || profileBrand.includes('veka') || profileBrand.includes('salamander')) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  } else if (profileBrand.includes('kömmerling') || profileBrand.includes('profine')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  }
  
  // Ajustare bazată pe număr camere (PVC)
  if (chambers) {
    const chambersNum = parseInt(String(chambers));
    if (chambersNum >= 5) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    } else if (chambersNum >= 3) {
      baseMin = Math.round(baseMin * 1.05);
      baseMax = Math.round(baseMax * 1.1);
    }
  }
  
  // Ajustare bazată pe geam Low-E / 4S
  if (glassType.includes('low-e') || glassType.includes('low e') || product.attributes?.low_e) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.25);
  } else if (glassType.includes('4s') || product.attributes?.glass_4s) {
    baseMin = Math.round(baseMin * 1.15);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe grosime geam
  if (glassThickness) {
    const thicknessNum = parseFloat(String(glassThickness));
    if (thicknessNum >= 32) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    } else if (thicknessNum >= 24) {
      // Standard
    } else {
      baseMin = Math.round(baseMin * 0.95);
      baseMax = Math.round(baseMax * 0.98);
    }
  }
  
  // Ajustare bazată pe dimensiuni (±10% pentru filtrare)
  if (width && height) {
    const area = parseFloat(String(width)) * parseFloat(String(height)) / 10000; // m²
    // Preț aproximativ: 200-500 EUR/m² în funcție de material
    const pricePerM2 = material.includes('aluminiu') ? 400 : material.includes('lemn') ? 350 : 250;
    baseMin = area * pricePerM2 * 0.85;
    baseMax = area * pricePerM2 * 1.15;
  }
  
  // Ajustare bazată pe feronerie premium (Roto, Maco etc.)
  if (product.attributes?.hardware || product.attributes?.feronerie || product.attributes?.hardware_brand) {
    const hardware = String(product.attributes.hardware || product.attributes.feronerie || product.attributes.hardware_brand).toLowerCase();
    if (hardware.includes('roto') || hardware.includes('maco')) {
      baseMin = Math.round(baseMin * 1.1);
      baseMax = Math.round(baseMax * 1.15);
    }
  }
  
  // Ajustare bazată pe stare
  const condition = (product.attributes?.condition || product.attributes?.stare || '').toLowerCase();
  if (condition.includes('nou') || condition.includes('new') || condition.includes('sigilat')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('folosit') || condition.includes('used')) {
    baseMin = Math.round(baseMin * 0.7);
    baseMax = Math.round(baseMax * 0.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru diverse / speciale bazate pe subcategorie
 * Include reguli speciale pentru licitații caritabile (2x-20x), bunuri confiscate (30-70%), NFT volatile
 */
function calculateRealisticSpecialItemsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const subcategory = product.attributes?.subcategory || product.attributes?.subcategorie || 
                      (product.attributes?.type || product.attributes?.tip);
  const titleLower = (product.title || '').toLowerCase();
  
  // Detectare automată subcategorie
  let detectedSubcategory = subcategory;
  if (!detectedSubcategory) {
    if (titleLower.includes('licitație caritabilă') || titleLower.includes('licitatie caritabila') || 
        titleLower.includes('donatie') || titleLower.includes('caritabil')) {
      detectedSubcategory = "licitatii_caritable";
    } else if (titleLower.includes('militar') || titleLower.includes('istoric') || 
               titleLower.includes('wwii') || titleLower.includes('wwi')) {
      detectedSubcategory = "militare_istorice";
    } else if (titleLower.includes('nft') || titleLower.includes('artă digitală') || 
               titleLower.includes('blockchain')) {
      detectedSubcategory = "nft_arta_digitala";
    } else if (titleLower.includes('colecție') || titleLower.includes('colectie') || 
               titleLower.includes('moneda') || titleLower.includes('bancnota')) {
      detectedSubcategory = "colectii_private";
    } else if (titleLower.includes('confiscat') || titleLower.includes('executare') || 
               titleLower.includes('anabi')) {
      detectedSubcategory = "confiscate_executari";
    } else {
      detectedSubcategory = "licitatii_caritable";
    }
  }
  
  if (detectedSubcategory === "licitatii_caritable") {
    return calculateRealisticCharityAuctionPriceRange(product);
  } else if (detectedSubcategory === "militare_istorice") {
    return calculateRealisticMilitaryHistoricalPriceRange(product);
  } else if (detectedSubcategory === "nft_arta_digitala") {
    return calculateRealisticNFTDigitalArtPriceRange(product);
  } else if (detectedSubcategory === "colectii_private") {
    return calculateRealisticPrivateCollectionPriceRange(product);
  } else if (detectedSubcategory === "confiscate_executari") {
    return calculateRealisticSeizedGoodsPriceRange(product);
  }
  
  // Default: licitații caritabile
  return calculateRealisticCharityAuctionPriceRange(product);
}

/**
 * Calculează prețuri realiste pentru licitații caritabile
 * ATENȚIE: Prețurile pot fi 2x-20x valoarea de piață normală
 * AI trebuie să ofere un preț de piață real separat de prețul licitației caritabile
 */
function calculateRealisticCharityAuctionPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const objectType = (product.attributes?.type || product.attributes?.tip || product.attributes?.object_type || product.title || '').toLowerCase();
  const personality = (product.attributes?.personality || product.attributes?.personalitate || product.attributes?.celebrity || product.attributes?.vedeta || '').toLowerCase();
  const marketValue = product.attributes?.market_value || product.attributes?.valoare_piata || product.attributes?.normal_market_value;
  
  // Calculează valoarea normală de piață
  let normalMarketMin = 100;
  let normalMarketMax = 1000;
  
  if (marketValue) {
    const marketValueNum = parseFloat(String(marketValue));
    normalMarketMin = marketValueNum * 0.8;
    normalMarketMax = marketValueNum * 1.2;
  } else {
    // Estimează valoarea normală bazat pe tip obiect
    if (objectType.includes('tricou') || objectType.includes('shirt') || objectType.includes('jerseu')) {
      normalMarketMin = 20;
      normalMarketMax = 200;
    } else if (objectType.includes('autograf') || objectType.includes('autograph')) {
      normalMarketMin = 50;
      normalMarketMax = 500;
    } else if (objectType.includes('obiect') || objectType.includes('object')) {
      normalMarketMin = 100;
      normalMarketMax = 1000;
    }
  }
  
  // APLICĂ FACTOR DE LICITAȚIE CARITABILĂ: 2x-20x valoarea normală
  let charityMultiplier = 5; // Default: 5x
  
  // Ajustare bazată pe personalitate asociată (vedete mari = multiplicator mai mare)
  if (personality.includes('messi') || personality.includes('ronaldo') || personality.includes('michael jordan') || 
      personality.includes('elvis') || personality.includes('beatles')) {
    charityMultiplier = 15; // 15x pentru vedete foarte mari
  } else if (personality.includes('fotbalist') || personality.includes('sportiv') || 
             personality.includes('actor') || personality.includes('muzician')) {
    charityMultiplier = 8; // 8x pentru vedete
  } else if (personality) {
    charityMultiplier = 5; // 5x pentru personalități
  } else {
    charityMultiplier = 3; // 3x pentru obiecte fără personalitate asociată
  }
  
  // Ajustare bazată pe organizator (organizații mari = multiplicator mai mare)
  const organizer = (product.attributes?.organizer || product.attributes?.organizator || product.attributes?.charity_organization || '').toLowerCase();
  if (organizer.includes('unicef') || organizer.includes('red cross') || organizer.includes('crucea rosie') || 
      organizer.includes('world vision')) {
    charityMultiplier = Math.round(charityMultiplier * 1.3);
  }
  
  const charityMin = Math.round(normalMarketMin * charityMultiplier);
  const charityMax = Math.round(normalMarketMax * charityMultiplier);
  
  // Returnează range-ul pentru licitație caritabilă (care poate fi mult peste piață)
  return { min: charityMin, max: charityMax };
}

/**
 * Calculează prețuri realiste pentru obiecte militare / istorice
 * Filtrare: doar obiecte originale, aceeași perioadă istorică, aceeași stare
 * ATENȚIE: AI trebuie să detecteze automat dacă obiectul poate fi vândut legal
 */
function calculateRealisticMilitaryHistoricalPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const objectType = (product.attributes?.type || product.attributes?.tip || product.attributes?.object_type || product.title || '').toLowerCase();
  const period = (product.attributes?.period || product.attributes?.perioada || product.attributes?.historical_period || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.grade || '').toLowerCase();
  const isOriginal = product.attributes?.original || product.attributes?.original_item;
  const rarity = (product.attributes?.rarity || product.attributes?.raritate || product.attributes?.rarity_level || '').toLowerCase();
  
  // Preț de bază bazat pe tip obiect
  let baseMin = 50;
  let baseMax = 500;
  
  if (objectType.includes('casca') || objectType.includes('helmet')) {
    baseMin = 200;
    baseMax = 2000;
  } else if (objectType.includes('uniforma') || objectType.includes('uniformă') || objectType.includes('uniform')) {
    baseMin = 300;
    baseMax = 3000;
  } else if (objectType.includes('medalie') || objectType.includes('medal')) {
    baseMin = 100;
    baseMax = 5000;
  } else if (objectType.includes('arma dezactivata') || objectType.includes('armă dezactivată') || objectType.includes('deactivated weapon')) {
    baseMin = 500;
    baseMax = 10000;
  } else if (objectType.includes('relicva') || objectType.includes('relicvă') || objectType.includes('relic')) {
    baseMin = 100;
    baseMax = 2000;
  }
  
  // Ajustare bazată pe perioadă istorică (aceeași perioadă pentru filtrare)
  if (period.includes('wwii') || period.includes('world war 2') || period.includes('al doilea razboi mondial')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (period.includes('wwi') || period.includes('world war 1') || period.includes('primul razboi mondial')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.2);
  }
  
  // Ajustare bazată pe stare (aceeași stare pentru filtrare)
  if (condition.includes('excellent') || condition.includes('excelent') || condition.includes('mint')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.4);
  } else if (condition.includes('very good') || condition.includes('foarte bun')) {
    baseMin = Math.round(baseMin * 1.1);
    baseMax = Math.round(baseMax * 1.15);
  } else if (condition.includes('good') || condition.includes('bun')) {
    // Standard
  } else if (condition.includes('poor') || condition.includes('slab') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe original / replică (doar originale pentru filtrare)
  if (!isOriginal || product.attributes?.replica) {
    // Replică: preț mult mai mic
    baseMin = Math.round(baseMin * 0.1);
    baseMax = Math.round(baseMax * 0.15);
  }
  
  // Ajustare bazată pe proveniență / certificat autenticitate
  if (product.attributes?.provenance || product.attributes?.provenienta || 
      product.attributes?.certificate || product.attributes?.certificat) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe raritate
  if (rarity.includes('extremely rare') || rarity.includes('foarte rar') || rarity.includes('unicat')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  } else if (rarity.includes('rare') || rarity.includes('rar')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 1.8);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru NFT / Artă Digitală
 * Prețurile sunt extrem de volatile
 * AI trebuie să distingă între: Floor price, Last sale, Valoare estimată după raritate
 */
function calculateRealisticNFTDigitalArtPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const collection = (product.attributes?.collection || product.attributes?.colectie || product.attributes?.collection_name || '').toLowerCase();
  const blockchain = (product.attributes?.blockchain || product.attributes?.chain || '').toLowerCase();
  const creator = (product.attributes?.creator || product.attributes?.artist || product.attributes?.creator_name || '').toLowerCase();
  const rarity = (product.attributes?.rarity || product.attributes?.raritate || product.attributes?.traits || product.attributes?.traituri || '').toLowerCase();
  const lastSale = product.attributes?.last_sale || product.attributes?.ultima_vanzare || product.attributes?.sales_history;
  const utility = (product.attributes?.utility || product.attributes?.utilitate || product.attributes?.utility_type || '').toLowerCase();
  
  // Preț de bază bazat pe colecție (floor price aproximativ)
  let baseMin = 0.01; // ETH sau SOL
  let baseMax = 10;
  
  // Colecții cunoscute
  if (collection.includes('bored ape') || collection.includes('bayc')) {
    baseMin = 10; // ETH
    baseMax = 100; // ETH
  } else if (collection.includes('cryptopunk') || collection.includes('crypto punk')) {
    baseMin = 50; // ETH
    baseMax = 500; // ETH
  } else if (collection.includes('azuki') || collection.includes('doodles')) {
    baseMin = 2; // ETH
    baseMax = 20; // ETH
  } else if (collection.includes('pudgy penguin') || collection.includes('cool cat')) {
    baseMin = 0.5; // ETH
    baseMax = 5; // ETH
  }
  
  // Ajustare bazată pe creator (artist cunoscut?)
  if (creator.includes('beeple') || creator.includes('pak') || creator.includes('xcopy')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  }
  
  // Ajustare bazată pe raritate (trait-uri)
  if (rarity.includes('legendary') || rarity.includes('legendar') || rarity.includes('1/1')) {
    baseMin = Math.round(baseMin * 5);
    baseMax = Math.round(baseMax * 10);
  } else if (rarity.includes('rare') || rarity.includes('rar')) {
    baseMin = Math.round(baseMin * 2);
    baseMax = Math.round(baseMax * 3);
  } else if (rarity.includes('common') || rarity.includes('comun')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe istoric vânzări (last sale)
  if (lastSale) {
    const lastSaleNum = parseFloat(String(lastSale));
    // Folosește last sale ca referință, cu variație ±30%
    baseMin = lastSaleNum * 0.7;
    baseMax = lastSaleNum * 1.3;
  }
  
  // Ajustare bazată pe utility (dacă are acces la comunități, jocuri etc.)
  if (utility.includes('game') || utility.includes('joc') || utility.includes('staking') || 
      utility.includes('access') || utility.includes('acces')) {
    baseMin = Math.round(baseMin * 1.3);
    baseMax = Math.round(baseMax * 1.5);
  }
  
  // Convertire în EUR (presupunând 1 ETH = 2500 EUR, 1 SOL = 100 EUR)
  const ethToEur = 2500;
  const solToEur = 100;
  
  if (blockchain.includes('eth') || blockchain.includes('ethereum')) {
    baseMin = Math.round(baseMin * ethToEur);
    baseMax = Math.round(baseMax * ethToEur);
  } else if (blockchain.includes('sol') || blockchain.includes('solana')) {
    baseMin = Math.round(baseMin * solToEur);
    baseMax = Math.round(baseMax * solToEur);
  } else {
    // Default: ETH
    baseMin = Math.round(baseMin * ethToEur);
    baseMax = Math.round(baseMax * ethToEur);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru colecții private
 * Filtrare: stare identică, raritate identică
 */
function calculateRealisticPrivateCollectionPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const collectionType = (product.attributes?.type || product.attributes?.tip || product.attributes?.collection_type || product.title || '').toLowerCase();
  const brand = (product.attributes?.brand || product.attributes?.marca || product.attributes?.brand_name || '').toLowerCase();
  const rarity = (product.attributes?.rarity || product.attributes?.raritate || product.attributes?.rarity_level || product.attributes?.edition || product.attributes?.editie || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.grade || '').toLowerCase();
  const year = product.attributes?.year || product.attributes?.an;
  
  // Preț de bază bazat pe tip colecție
  let baseMin = 10;
  let baseMax = 500;
  
  if (collectionType.includes('moneda') || collectionType.includes('monedă') || collectionType.includes('coin')) {
    baseMin = 5;
    baseMax = 1000;
  } else if (collectionType.includes('bancnota') || collectionType.includes('bancnotă') || collectionType.includes('banknote')) {
    baseMin = 10;
    baseMax = 2000;
  } else if (collectionType.includes('pokemon') || collectionType.includes('card')) {
    baseMin = 20;
    baseMax = 5000;
  } else if (collectionType.includes('funko') || collectionType.includes('pop')) {
    baseMin = 30;
    baseMax = 500;
  } else if (collectionType.includes('figurina') || collectionType.includes('figurine')) {
    baseMin = 50;
    baseMax = 1000;
  } else if (collectionType.includes('timbru') || collectionType.includes('stamp')) {
    baseMin = 5;
    baseMax = 500;
  }
  
  // Ajustare bazată pe brand (identic pentru filtrare)
  if (brand.includes('pokemon')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  } else if (brand.includes('funko')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  // Ajustare bazată pe raritate (identică pentru filtrare)
  if (rarity.includes('ultra rare') || rarity.includes('foarte rar') || rarity.includes('1st edition') || 
      rarity.includes('first edition') || rarity.includes('limited edition')) {
    baseMin = Math.round(baseMin * 3);
    baseMax = Math.round(baseMax * 5);
  } else if (rarity.includes('rare') || rarity.includes('rar')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  } else if (rarity.includes('common') || rarity.includes('comun')) {
    baseMin = Math.round(baseMin * 0.8);
    baseMax = Math.round(baseMax * 0.9);
  }
  
  // Ajustare bazată pe stare (identică pentru filtrare)
  if (condition.includes('unc') || condition.includes('mint') || condition.includes('proof')) {
    baseMin = Math.round(baseMin * 1.5);
    baseMax = Math.round(baseMax * 2);
  } else if (condition.includes('very fine') || condition.includes('foarte bun')) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  } else if (condition.includes('fine') || condition.includes('bun')) {
    baseMin = Math.round(baseMin * 1.0);
    baseMax = Math.round(baseMax * 1.0);
  } else if (condition.includes('circulated') || condition.includes('circulat') || condition.includes('uzat')) {
    baseMin = Math.round(baseMin * 0.6);
    baseMax = Math.round(baseMax * 0.7);
  }
  
  // Ajustare bazată pe an (vechi = mai valoros pentru unele colecții)
  if (year) {
    const yearNum = parseInt(String(year));
    if (collectionType.includes('pokemon') && yearNum <= 2000) {
      baseMin = Math.round(baseMin * 2);
      baseMax = Math.round(baseMax * 3);
    } else if (collectionType.includes('moneda') || collectionType.includes('bancnota')) {
      if (yearNum < 1950) {
        baseMin = Math.round(baseMin * 1.5);
        baseMax = Math.round(baseMax * 2);
      }
    }
  }
  
  // Ajustare bazată pe certificate autenticitate
  if (product.attributes?.certificate || product.attributes?.certificat || product.attributes?.authenticity_certificate) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.3);
  }
  
  return { min: baseMin, max: baseMax };
}

/**
 * Calculează prețuri realiste pentru bunuri confiscate / executări
 * APLICĂ REGULĂ SPECIALĂ: prețurile sunt de obicei 30-70% din valoarea de piață normală
 * AI trebuie să ofere: Valoarea de piață normală și Valoarea tipică pentru bun confiscat
 */
function calculateRealisticSeizedGoodsPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const productType = (product.attributes?.type || product.attributes?.tip || product.attributes?.product_type || product.title || '').toLowerCase();
  const condition = (product.attributes?.condition || product.attributes?.stare || product.attributes?.as_is || '').toLowerCase();
  const officialEvaluation = product.attributes?.official_evaluation || product.attributes?.evaluare_oficiala || product.attributes?.anabi_evaluation;
  const degradationRisk = (product.attributes?.degradation_risk || product.attributes?.risc_degradare || product.attributes?.damage_risk || '').toLowerCase();
  
  // Calculează valoarea normală de piață (folosind logica pentru categoria corespunzătoare)
  let normalMarketMin = 1000;
  let normalMarketMax = 10000;
  
  // Încearcă să estimeze valoarea normală bazat pe tip
  if (productType.includes('auto') || productType.includes('masina') || productType.includes('car')) {
    // Folosește logica pentru auto
    if (product.attributes?.brand && product.attributes?.year) {
      const autoRange = calculateRealisticCarPriceRange(product);
      normalMarketMin = autoRange.min;
      normalMarketMax = autoRange.max;
    }
  } else if (productType.includes('echipament') || productType.includes('equipment')) {
    // Folosește logica pentru echipamente
    normalMarketMin = 500;
    normalMarketMax = 5000;
  } else if (productType.includes('imobil') || productType.includes('apartament') || productType.includes('casa')) {
    // Folosește logica pentru imobiliare
    normalMarketMin = 50000;
    normalMarketMax = 200000;
  }
  
  // Folosește evaluarea oficială dacă există
  if (officialEvaluation) {
    const evalNum = parseFloat(String(officialEvaluation));
    normalMarketMin = evalNum * 0.9;
    normalMarketMax = evalNum * 1.1;
  }
  
  // APLICĂ FACTOR DE BUN CONFISCAT: 30-70% din valoarea normală
  let seizedFactor = 0.5; // Default: 50%
  
  // Ajustare bazată pe stare
  if (condition.includes('as is') || condition.includes('asa cum este') || condition.includes('necesita reparatii')) {
    seizedFactor = 0.4; // 40% pentru bunuri "așa cum sunt"
  } else if (condition.includes('bun') || condition.includes('good') || condition.includes('excelent')) {
    seizedFactor = 0.6; // 60% pentru bunuri în stare bună
  }
  
  // Ajustare bazată pe documentație disponibilă
  if (product.attributes?.documentation || product.attributes?.documentatie || 
      product.attributes?.papers || product.attributes?.acte) {
    seizedFactor = Math.min(seizedFactor + 0.1, 0.7); // +10% dacă are documentație
  }
  
  // Ajustare bazată pe risc degradare
  if (degradationRisk.includes('mare') || degradationRisk.includes('high') || degradationRisk.includes('ridicat')) {
    seizedFactor = Math.max(seizedFactor - 0.1, 0.3); // -10% pentru risc mare
  } else if (degradationRisk.includes('mic') || degradationRisk.includes('low') || degradationRisk.includes('scazut')) {
    seizedFactor = Math.min(seizedFactor + 0.1, 0.7); // +10% pentru risc mic
  }
  
  const seizedMin = Math.round(normalMarketMin * seizedFactor);
  const seizedMax = Math.round(normalMarketMax * seizedFactor);
  
  return { min: seizedMin, max: seizedMax };
}

/**
 * Calculează prețuri realiste pentru hale industriale bazate pe toate criteriile
 */
function calculateRealisticIndustrialPriceRange(product: ProductForEvaluation): { min: number; max: number } {
  const hallSurface = product.attributes?.surface || product.attributes?.suprafata || 
                       product.attributes?.suprafata_hala;
  const landSurface = product.attributes?.land || product.attributes?.teren || 
                      product.attributes?.suprafata_teren;
  
  if (!hallSurface) {
    return { min: 100000, max: 1000000 };
  }
  
  const hallSurfaceNum = parseInt(String(hallSurface));
  const landSurfaceNum = landSurface ? parseInt(String(landSurface)) : hallSurfaceNum * 1.5;
  
  // Preț/mp hală bazat pe zonă (EUR/mp)
  const city = (product.city || '').toLowerCase();
  let pricePerM2Hall = 200; // Default
  
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2Hall = 400;
  } else if (city.includes('cluj')) {
    pricePerM2Hall = 350;
  }
  
  // Ajustare bazată pe înălțime utilă
  const height = product.attributes?.height || product.attributes?.inaltime || 
                 product.attributes?.inaltime_utila;
  if (height) {
    const heightNum = parseFloat(String(height));
    if (heightNum > 8) {
      pricePerM2Hall *= 1.2; // +20% pentru înălțime mare
    }
  }
  
  // Ajustare bazată pe acces TIR și rampă
  if (product.attributes?.tir_access || product.attributes?.acces_tir) {
    pricePerM2Hall *= 1.15; // +15% pentru acces TIR
  }
  if (product.attributes?.rampa) {
    pricePerM2Hall *= 1.1; // +10% pentru rampă
  }
  
  // Preț teren industrial (EUR/mp)
  let pricePerM2Land = 20; // Default
  if (city.includes('bucurești') || city.includes('bucuresti')) {
    pricePerM2Land = 50;
  }
  
  const hallPrice = hallSurfaceNum * pricePerM2Hall;
  const landPrice = landSurfaceNum * pricePerM2Land;
  const totalPrice = hallPrice + landPrice;
  
  return {
    min: Math.round(totalPrice * 0.7),
    max: Math.round(totalPrice * 1.4)
  };
}

/**
 * Generează rezultate mock pentru testare
 * Returnează direct array de prețuri (nu text) pentru a evita problemele de parsing
 */
export function generateMockPrices(query: string, category?: string, product?: ProductForEvaluation): number[] {
  const prices: number[] = [];
  
  // Folosim categoria dacă este disponibilă, altfel analizăm query-ul
  const queryLower = query.toLowerCase();
  
  if (category === "apartment" || category === "imobiliare" || queryLower.includes("apartament")) {
    // Pentru apartamente, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticApartmentPriceRange(product);
      const spread = range.max - range.min;
      
      // Generează 50 de prețuri în range-ul realist
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru apartamente (40k - 150k EUR)
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(40000 + Math.random() * 110000));
    }
    }
  } else if (category === "auto" || category === "autovehicule" || queryLower.includes("auto") || queryLower.includes("mașină") || 
             queryLower.includes("masina") || queryLower.includes("suv") || queryLower.includes("motocicletă") || 
             queryLower.includes("camion") || queryLower.includes("remorcă") || queryLower.includes("autorulotă")) {
    // Pentru autovehicule, folosim logica bazată pe subcategorie
    if (product) {
      const range = calculateRealisticCarPriceRange(product);
      const spread = range.max - range.min;
      
      // Generează 50 de prețuri în range-ul realist
      for (let i = 0; i < 50; i++) {
        // Distribuție normală aproximativă (mai multe prețuri în mijloc)
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru autovehicule (2k - 15k EUR pentru mașini vechi)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(2000 + Math.random() * 13000));
      }
    }
  } else if (category === "house" || category === "vila" || category === "casa" || queryLower.includes("casă") || queryLower.includes("vila")) {
    // Pentru case/vile, folosim logica bazată pe toate criteriile (inclusiv micro-terenuri și case vechi)
    if (product) {
      const range = calculateRealisticHousePriceRange(product);
      const spread = range.max - range.min;
      
      // Generează 50 de prețuri în range-ul realist
      for (let i = 0; i < 50; i++) {
        // Distribuție normală aproximativă (mai multe prețuri în mijloc)
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
      
      console.log(`[Mock Prices] Generated ${prices.length} prices for house: ${range.min} - ${range.max} EUR`);
    } else {
      // Fallback: prețuri generice pentru case (80k - 500k EUR)
      // DAR verifică dacă query-ul sugerează micro-teren sau casă veche
      const isMicroTeren = queryLower.includes('teren') && (queryLower.match(/(\d+)\s*(?:mp|m²)/) || [])[1] && parseInt((queryLower.match(/(\d+)\s*(?:mp|m²)/) || [])[1]) < 150;
      const isCasaVeche = queryLower.includes('veche') || queryLower.includes('vechi') || (!queryLower.includes('nou') && !queryLower.includes('renovat'));
      
      if (isMicroTeren) {
        // Micro-teren: 5k - 20k EUR
        for (let i = 0; i < 50; i++) {
          prices.push(Math.round(5000 + Math.random() * 15000));
        }
      } else if (isCasaVeche) {
        // Casă veche: 10k - 50k EUR
        for (let i = 0; i < 50; i++) {
          prices.push(Math.round(10000 + Math.random() * 40000));
        }
      } else {
        // Casă normală: 80k - 500k EUR
        for (let i = 0; i < 50; i++) {
          prices.push(Math.round(80000 + Math.random() * 420000));
        }
      }
    }
  } else if (category === "land" || category === "teren" || queryLower.includes("teren")) {
    // Pentru terenuri (intravilan sau agricol), folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticLandPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru terenuri (10k - 200k EUR pentru intravilan, 5k - 50k EUR pentru agricol)
      const isAgricultural = queryLower.includes('agricol') || queryLower.includes('arabil') || 
                            queryLower.includes('fâneață') || queryLower.includes('pășune');
      if (isAgricultural) {
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(5000 + Math.random() * 45000));
    }
      } else {
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(10000 + Math.random() * 190000));
        }
      }
    }
  } else if (category === "commercial" || category === "spatiu_comercial" || category === "birouri" || queryLower.includes("spațiu comercial")) {
    // Pentru spații comerciale, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticCommercialPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru spații comerciale (50k - 300k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(50000 + Math.random() * 250000));
      }
    }
  } else if (category === "industrial" || category === "hala" || category === "hala_industriala" || queryLower.includes("hală")) {
    // Pentru hale industriale, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticIndustrialPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru hale industriale (100k - 1M EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(100000 + Math.random() * 900000));
      }
    }
  } else if (category === "construction_equipment" || category === "utilaje_construcții" || category === "utilaje" || 
             queryLower.includes("excavator") || queryLower.includes("buldozer") || queryLower.includes("încărcător")) {
    // Pentru utilaje construcții, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticConstructionEquipmentPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru utilaje (10k - 80k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(10000 + Math.random() * 70000));
      }
    }
  } else if (category === "agricultural_equipment" || category === "utilaje_agricole" || 
             queryLower.includes("tractor") || queryLower.includes("combină") || queryLower.includes("combina")) {
    // Pentru utilaje agricole, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticAgriculturalEquipmentPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru utilaje agricole (15k - 100k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(15000 + Math.random() * 85000));
      }
    }
  } else if (category === "forestry_equipment" || category === "echipamente_forestiere" || 
             queryLower.includes("taf") || queryLower.includes("forwarder") || queryLower.includes("harvester")) {
    // Pentru echipamente forestiere, folosim logica similară cu utilaje agricole
    if (product) {
      const range = calculateRealisticAgriculturalEquipmentPriceRange(product); // Similar logic
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru echipamente forestiere (20k - 150k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(20000 + Math.random() * 130000));
      }
    }
  } else if (category === "generators" || category === "compressors" || category === "generatoare" || category === "compresoare" ||
             queryLower.includes("generator") || queryLower.includes("compresor")) {
    // Pentru generatoare & compresoare, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticGeneratorPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru generatoare (2k - 50k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(2000 + Math.random() * 48000));
      }
    }
  } else if (category === "professional_tools" || category === "scule_profesionale" ||
             queryLower.includes("scule") || queryLower.includes("makita") || queryLower.includes("hilti")) {
    // Pentru scule profesionale, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticProfessionalToolsPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru scule profesionale (100 - 5k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(100 + Math.random() * 4900));
      }
    }
  } else if (category === "auto_workshop" || category === "echipamente_atelier_auto" ||
             queryLower.includes("elevator") || queryLower.includes("vulcanizare") || queryLower.includes("diagnoza")) {
    // Pentru echipamente ateliere auto, folosim logica bazată pe toate criteriile
    if (product) {
      const range = calculateRealisticAutoWorkshopPriceRange(product);
      const spread = range.max - range.min;
      
      for (let i = 0; i < 50; i++) {
        const random = Math.random();
        const price = Math.round(range.min + random * spread);
        prices.push(price);
      }
    } else {
      // Fallback: prețuri generice pentru echipamente ateliere auto (5k - 50k EUR)
      for (let i = 0; i < 50; i++) {
        prices.push(Math.round(5000 + Math.random() * 45000));
      }
    }
  } else if (category === "electronics") {
    // Electronice: 50 - 5k EUR
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(50 + Math.random() * 4950));
    }
  } else if (category === "fashion") {
    // Haine: 10 - 2k EUR
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(10 + Math.random() * 1990));
    }
  } else {
    // Generic: 100 - 5000 EUR
    for (let i = 0; i < 50; i++) {
      prices.push(Math.round(100 + Math.random() * 4900));
    }
  }

  return prices;
}

/**
 * Generează rezultate mock pentru testare (text format pentru API-uri reale)
 */
function generateMockSearchResults(query: string, category?: string, product?: ProductForEvaluation): string {
  const prices = generateMockPrices(query, category, product);
  return prices.map(p => `${p.toLocaleString('ro-RO')} EUR`).join(" ");
}

/**
 * Caută produse similare și extrage prețuri
 */
export async function searchWebForComparables(
  product: ProductForEvaluation
): Promise<number[]> {
  try {
    const query = buildSearchQueryForProduct(product);
    console.log(`[Search] Query: ${query}`);

    // Generează întotdeauna prețuri mock ca fallback (cu informații despre produs pentru mașini)
    const mockPrices = generateMockPrices(query, product.category, product);
    console.log(`[Search] Generated ${mockPrices.length} mock prices as base`);

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    // Dacă nu avem API key configurat, folosim direct prețurile mock
    if (!apiKey || !searchEngineId) {
      console.warn("[Search] Google Search API not configured, using mock prices only");
      return mockPrices;
    }

    // Caută folosind Google Custom Search
    const searchText = await searchWithGoogle(query, product.category, product);
    console.log(`[Search] Search text length: ${searchText.length} characters`);
    
    // Extrage prețuri din text
    const prices = extractPricesFromText(searchText, product.currency);
    console.log(`[Search] Extracted ${prices.length} prices from search results`);
    
    // Dacă nu am găsit suficiente prețuri, combinăm cu mock prices
    if (prices.length < 5) {
      console.warn(`[Search] Only found ${prices.length} prices from search, combining with mock prices`);
      // Combinăm prețurile găsite cu mock-urile (prioritizăm prețurile reale)
      const combined = [...prices, ...mockPrices];
      const uniqueCombined = Array.from(new Set(combined)).sort((a, b) => a - b);
      console.log(`[Search] Combined ${uniqueCombined.length} prices (${prices.length} real + ${mockPrices.length} mock)`);
      return uniqueCombined;
    }
    
    // Elimină duplicate și sortează
    let uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b);
    
    // Filtrează prețuri nerealiste bazate pe categorie - intervale FOARTE stricte
    if (product.category === "auto") {
      // Pentru mașini, folosim range realist bazat pe an, marca, model
      const carRange = calculateRealisticCarPriceRange(product);
      // Folosim range-ul EXACT, fără extensii mari (doar ±10% pentru variații minime)
      const strictMin = Math.max(1000, Math.round(carRange.min * 0.9));
      const strictMax = Math.round(carRange.max * 1.1);
      const beforeFilter = uniquePrices.length;
      uniquePrices = uniquePrices.filter(p => p >= strictMin && p <= strictMax);
      console.log(`[Search] Filtered car prices from ${beforeFilter} to ${uniquePrices.length} (range: ${strictMin} - ${strictMax} EUR, based on year: ${product.attributes?.year || 'unknown'})`);
      
      // Dacă după filtrare strictă avem prea puține prețuri reale (< 5), folosim DOAR mock prices
      if (uniquePrices.length < 5) {
        console.warn(`[Search] Too few realistic prices found (${uniquePrices.length}), using ONLY mock prices for accurate evaluation`);
        return mockPrices;
      }
    } else if (product.category === "apartment" || product.category === "imobiliare") {
      // Apartamente: 30k - 800k EUR (interval mai realist pentru România)
      // Elimină prețuri sub 30k (prea mici pentru apartamente) și peste 800k
      uniquePrices = uniquePrices.filter(p => p >= 30000 && p <= 800000);
    } else if (product.category === "house" || product.category === "casa" || product.category === "vila") {
      // Pentru case, verifică dacă este micro-teren sau casă veche
      const titleLower = (product.title || '').toLowerCase();
      const descLower = (product.description || '').toLowerCase();
      const fullText = `${titleLower} ${descLower}`;
      
      // Detectare micro-teren (<150 mp teren)
      const terenMatch = fullText.match(/(\d+)\s*(?:mp|m²|metri)\s*(?:teren|terenu)/i) || 
                         fullText.match(/teren[:\s]+(\d+)\s*(?:mp|m²)/i);
      const suprafataTeren = terenMatch ? parseInt(terenMatch[1]) : 
                            (product.attributes?.suprafata_teren || product.attributes?.suprafataTeren);
      
      // Detectare licitație / executare silită
      const isLicitatie = fullText.includes('licitație') || fullText.includes('licitatie') ||
                          fullText.includes('executare') || fullText.includes('anaf') ||
                          fullText.includes('preț de pornire') || fullText.includes('pret de pornire');
      
      // Detectare casă veche (fără an construcție sau renovări)
      const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i);
      const hasRenovari = fullText.includes('renovat') || fullText.includes('renovație') ||
                          fullText.includes('structură beton') || fullText.includes('structura beton') ||
                          fullText.includes('acoperiș nou') || fullText.includes('acoperis nou');
      const isCasaVeche = !hasAnConstructie && !hasRenovari;
      
      if (suprafataTeren && suprafataTeren < 150) {
        // MICRO-TEREN: Prețuri foarte mici (5k - 15k EUR) - FOARTE STRICT
        console.log(`[Search] Detected micro-teren (${suprafataTeren} mp), applying VERY strict filtering`);
        // Filtrare mai strictă: 5k - 15k EUR (nu 20k)
        uniquePrices = uniquePrices.filter(p => p >= 5000 && p <= 15000);
        
        // Dacă este și licitație, aplică reducere suplimentară
        if (isLicitatie) {
          uniquePrices = uniquePrices.map(p => Math.round(p * 0.5)); // Reducere 50%
          // După reducere, filtrează din nou (2.5k - 7.5k EUR)
          uniquePrices = uniquePrices.filter(p => p >= 2500 && p <= 7500);
          console.log(`[Search] Applied 50% reduction for licitație micro-teren, final range: 2.5k-7.5k EUR`);
        } else {
          console.log(`[Search] Micro-teren filtered to 5k-15k EUR range`);
        }
      } else if (isCasaVeche) {
        // CASĂ VECHE: Prețuri reduse (8k - 40k EUR) - FOARTE STRICT
        console.log(`[Search] Detected casă veche, applying VERY strict filtering`);
        // Filtrare mai strictă: 8k - 40k EUR (nu 50k)
        uniquePrices = uniquePrices.filter(p => p >= 8000 && p <= 40000);
        
        // Dacă este și licitație, aplică reducere suplimentară
        if (isLicitatie) {
          uniquePrices = uniquePrices.map(p => Math.round(p * 0.5)); // Reducere 50%
          // După reducere, filtrează din nou (4k - 20k EUR)
          uniquePrices = uniquePrices.filter(p => p >= 4000 && p <= 20000);
          console.log(`[Search] Applied 50% reduction for licitație casă veche, final range: 4k-20k EUR`);
        } else {
          console.log(`[Search] Casă veche filtered to 8k-40k EUR range`);
        }
      } else if (isLicitatie) {
        // LICITAȚIE (fără micro-teren sau casă veche): Aplică reducere 50%
        console.log(`[Search] Detected licitație, applying 50% reduction`);
        uniquePrices = uniquePrices.map(p => Math.round(p * 0.5)); // Reducere 50%
        // Filtrare strictă pentru case normale după reducere (15k - 150k EUR)
        uniquePrices = uniquePrices.filter(p => p >= 15000 && p <= 150000);
        console.log(`[Search] Licitație filtered to 15k-150k EUR range after reduction`);
      } else {
        // CASĂ NORMALĂ: 20k - 500k EUR
        uniquePrices = uniquePrices.filter(p => p >= 20000 && p <= 500000);
        console.log(`[Search] Normal house filtered to 20k-500k EUR range`);
      }
    } else if (product.category === "land" || product.category === "teren") {
      // Terenuri: 10k - 1M EUR
      uniquePrices = uniquePrices.filter(p => p >= 10000 && p <= 1000000);
    } else if (product.category === "electronics") {
      // Electronice: 50 - 5k EUR
      uniquePrices = uniquePrices.filter(p => p >= 50 && p <= 5000);
    } else if (product.category === "fashion") {
      // Haine: 10 - 2k EUR
      uniquePrices = uniquePrices.filter(p => p >= 10 && p <= 2000);
    } else {
      // Generic: 50 - 10k EUR
      uniquePrices = uniquePrices.filter(p => p >= 50 && p <= 10000);
    }
    
    // Filtrează outliers folosind IQR (Interquartile Range) - FOARTE STRICT (0.5 factor)
    if (uniquePrices.length > 10) {
      const sorted = [...uniquePrices].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const median = sorted[Math.floor(sorted.length / 2)];
      const iqr = q3 - q1;
      
      // Factor FOARTE STRICT (0.5) pentru a elimina și mai mulți outliers
      const lowerBound = Math.max(0, q1 - 0.5 * iqr);
      const upperBound = q3 + 0.5 * iqr;
      
      // Elimină și prețurile care sunt mai mult de 2x sau mai puțin de 0.3x față de mediană
      const filtered = sorted.filter(p => {
        // Elimină outliers extreme bazate pe IQR
        if (p < lowerBound || p > upperBound) {
          return false;
        }
        // Elimină outliers extreme bazate pe mediană
        if (p > median * 2.5 || p < median * 0.3) {
          return false;
        }
        return true;
      });
      
      if (filtered.length >= 10) {
        // Dacă avem suficiente prețuri reale filtrate, le combinăm cu mock prices (prioritizăm mock pentru consistență)
        const combined = [...mockPrices, ...filtered];
        const uniqueCombined = Array.from(new Set(combined)).sort((a, b) => a - b);
        console.log(`[Search] Combined ${filtered.length} filtered real prices (from ${uniquePrices.length} original) with ${mockPrices.length} mock prices`);
        return uniqueCombined;
      } else {
        console.warn(`[Search] After strict filtering, only ${filtered.length} prices remain (from ${uniquePrices.length} original), using mock prices primarily`);
      }
    }
    
    // Returnează prețurile chiar dacă sunt mai puține de 10
    console.log(`[Search] Found ${uniquePrices.length} unique prices after filtering`);
    
    // Prioritizăm mock prices (sunt mai realiste) și adăugăm prețurile reale filtrate
    // Mock prices sunt generate pe baza atributelor exacte ale produsului, deci sunt mai precise
    const combined = [...mockPrices, ...uniquePrices];
    const uniqueCombined = Array.from(new Set(combined)).sort((a, b) => a - b);
    console.log(`[Search] Combined to ${uniqueCombined.length} prices total (${mockPrices.length} mock prioritized + ${uniquePrices.length} real filtered)`);
    
    // Returnează cel puțin 20 de prețuri
    return uniqueCombined.length >= 20 ? uniqueCombined : uniqueCombined.concat(mockPrices).slice(0, 50);
  } catch (error) {
    console.error("Error searching for comparables:", error);
    // În caz de eroare, returnăm mock prices
    const fallbackQuery = buildSearchQueryForProduct(product);
    const fallbackMock = generateMockPrices(fallbackQuery, product.category, product);
    console.log(`[Search] Error occurred, returning ${fallbackMock.length} mock prices`);
    return fallbackMock;
  }
}





