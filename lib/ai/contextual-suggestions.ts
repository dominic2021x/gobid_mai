/**
 * Sistem inteligent de sugestii contextuale bazate pe căutare reală
 * Generează sugestii relevante care țin utilizatorul pe website
 */

import { supabaseAdmin } from '@/lib/supabase';
import { analyzeQuery } from './brand-detector';
import { getAdaptiveCorrection, getSimilarPatterns } from './adaptive-learning';

export interface ContextualSuggestion {
  text: string;
  priority: number; // Mai mic = mai prioritar
  category?: string;
  location?: string;
}

/**
 * Lista completă de categorii disponibile
 */
const ALL_CATEGORIES = [
  'Imobiliare',
  'Executări',
  'Autovehicule',
  'Utilaje & Echipamente',
  'Artă & Antichități',
  'Electronice & Tehnologie',
  'Casă & Grădină',
  'Modă & Lifestyle',
  'Agricultură & Zootehnie',
  'Maritime & Aeronautice',
  'Business & Licitații',
  'Materiale Construcții',
  'Diverse / Speciale'
];

/**
 * Detectează tipul de căutare și categoria
 */
function detectSearchType(query: string): {
  type: 'imobiliare' | 'masini' | 'executari' | 'electronice' | 'moda' | 'agricultura' | 'general';
  category?: string;
} {
  const lowerQuery = query.toLowerCase();
  
  // Imobiliare
  if (
    lowerQuery.includes('apartament') ||
    lowerQuery.includes('casa') ||
    lowerQuery.includes('casă') ||
    lowerQuery.includes('birou') ||
    lowerQuery.includes('teren') ||
    lowerQuery.includes('hala') ||
    lowerQuery.includes('imobiliar') ||
    lowerQuery.includes('vila') ||
    lowerQuery.includes('vila')
  ) {
    return { type: 'imobiliare', category: 'Imobiliare' };
  }
  
  // Executări Silite
  if (
    lowerQuery.includes('executare') ||
    lowerQuery.includes('executari') ||
    lowerQuery.includes('silita') ||
    lowerQuery.includes('silite') ||
    lowerQuery.includes('licitatie') ||
    lowerQuery.includes('licitație')
  ) {
    return { type: 'executari', category: 'Executări' };
  }
  
  // Mașini / Autovehicule
  if (
    lowerQuery.includes('masina') ||
    lowerQuery.includes('mașină') ||
    lowerQuery.includes('auto') ||
    lowerQuery.includes('bmw') ||
    lowerQuery.includes('mercedes') ||
    lowerQuery.includes('audi') ||
    lowerQuery.includes('opel') ||
    lowerQuery.includes('ford') ||
    lowerQuery.includes('dacia') ||
    lowerQuery.includes('motocicleta') ||
    lowerQuery.includes('camion')
  ) {
    return { type: 'masini', category: 'Autovehicule' };
  }
  
  // Electronice
  if (
    lowerQuery.includes('telefon') ||
    lowerQuery.includes('laptop') ||
    lowerQuery.includes('tableta') ||
    lowerQuery.includes('tv') ||
    lowerQuery.includes('televizor') ||
    lowerQuery.includes('electronice') ||
    lowerQuery.includes('smartphone') ||
    lowerQuery.includes('pc')
  ) {
    return { type: 'electronice', category: 'Electronice & Tehnologie' };
  }
  
  // Modă
  if (
    lowerQuery.includes('haina') ||
    lowerQuery.includes('haină') ||
    lowerQuery.includes('pantof') ||
    lowerQuery.includes('geanta') ||
    lowerQuery.includes('geantă') ||
    lowerQuery.includes('ceas') ||
    lowerQuery.includes('moda') ||
    lowerQuery.includes('modă') ||
    lowerQuery.includes('bijuterie')
  ) {
    return { type: 'moda', category: 'Modă & Lifestyle' };
  }
  
  // Agricultură
  if (
    lowerQuery.includes('tractor') ||
    lowerQuery.includes('combina') ||
    lowerQuery.includes('utilaj agricol') ||
    lowerQuery.includes('agricultura') ||
    lowerQuery.includes('agricultură')
  ) {
    return { type: 'agricultura', category: 'Agricultură & Zootehnie' };
  }
  
  return { type: 'general' };
}

/**
 * Extrage informații din query pentru imobiliare
 */
function extractRealEstateInfo(query: string): {
  city?: string;
  rooms?: number;
  type?: 'apartament' | 'casa' | 'birou' | 'teren' | 'hala';
} {
  const lowerQuery = query.toLowerCase();
  const info: any = {};
  
  // Detectează oraș
  const cities = ['bucurești', 'brașov', 'cluj', 'timișoara', 'iași', 'constanța'];
  for (const city of cities) {
    if (lowerQuery.includes(city) || lowerQuery.includes(city.replace('ș', 's').replace('ț', 't'))) {
      info.city = city;
      break;
    }
  }
  
  // Detectează număr de camere
  const roomPatterns = [
    { pattern: /(\d+)\s*camere?/i, extract: (m: RegExpMatchArray) => parseInt(m[1]) },
    { pattern: /dou[ăa]\s*camere?/i, extract: () => 2 },
    { pattern: /trei\s*camere?/i, extract: () => 3 },
    { pattern: /patru\s*camere?/i, extract: () => 4 },
    { pattern: /cinci\s*camere?/i, extract: () => 5 },
  ];
  
  for (const { pattern, extract } of roomPatterns) {
    const match = query.match(pattern);
    if (match) {
      info.rooms = extract(match);
      break;
    }
  }
  
  // Detectează tip
  if (lowerQuery.includes('apartament')) info.type = 'apartament';
  else if (lowerQuery.includes('casa') || lowerQuery.includes('casă')) info.type = 'casa';
  else if (lowerQuery.includes('birou')) info.type = 'birou';
  else if (lowerQuery.includes('teren')) info.type = 'teren';
  else if (lowerQuery.includes('hala')) info.type = 'hala';
  else info.type = 'apartament'; // default
  
  return info;
}

/**
 * Generează sugestii contextuale pentru imobiliare
 */
async function generateRealEstateSuggestions(
  query: string,
  info: { city?: string; rooms?: number; type?: string }
): Promise<string[]> {
  const suggestions: string[] = [];
  
  if (!supabaseAdmin) {
    return suggestions;
  }
  
  try {
    const cityCapitalized = info.city ? info.city.charAt(0).toUpperCase() + info.city.slice(1) : '';
    const typeLabel = info.type === 'apartament' ? 'Apartament' : 
                     info.type === 'casa' ? 'Casă' : 
                     info.type === 'birou' ? 'Birou' : 
                     info.type === 'teren' ? 'Teren' : 
                     info.type === 'hala' ? 'Hală' : 'Apartament';
    
    // 1. PRIORITATE 1: Același oraș, același tip, camere similare (3, 2, 4, 5, 6...)
    if (info.city && info.rooms && info.type) {
      // Ordinea: același număr, apoi -1, +1, -2, +2, etc.
      const roomOrder = [info.rooms, info.rooms - 1, info.rooms + 1, info.rooms - 2, info.rooms + 2, info.rooms + 3, info.rooms - 3]
        .filter(r => r > 0 && r <= 10)
        .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
      
      for (const rooms of roomOrder) {
        const searchPattern = info.type === 'apartament' 
          ? `%apartament%${rooms}%camere%${info.city}%`
          : `%${info.type}%${rooms}%camere%${info.city}%`;
        
        const { data } = await supabaseAdmin
          .from('products')
          .select('title, category')
          .ilike('title', searchPattern)
          .or('category.ilike.%imobiliare%,subcategory.ilike.%imobiliare%')
          .or('status.eq.active,approval_status.eq.approved')
          .limit(1);
        
        if (data && data.length > 0) {
          suggestions.push(`${typeLabel} ${rooms} camere în ${cityCapitalized}`);
        }
      }
    }
    
    // 2. PRIORITATE 2: Case în același oraș, același număr de camere (dacă a căutat apartament)
    if (info.city && info.rooms && info.type === 'apartament') {
        const { data } = await supabaseAdmin
          .from('products')
          .select('title')
          .or(`title.ilike.%casă%${info.rooms}%camere%${info.city}%,title.ilike.%casa%${info.rooms}%camere%${info.city}%`)
          .or('category.ilike.%imobiliare%,subcategory.ilike.%imobiliare%')
          .or('status.eq.active,approval_status.eq.approved')
          .limit(1);
      
      if (data && data.length > 0) {
        suggestions.push(`Casă ${info.rooms} camere în ${cityCapitalized}`);
      }
    }
    
    // 3. PRIORITATE 3: Alte tipuri în același oraș (birouri, terenuri, hale)
    if (info.city) {
      const otherTypes = [
        { key: 'birou', label: 'Birouri' },
        { key: 'teren', label: 'Terenuri' },
        { key: 'hala', label: 'Hale' }
      ].filter(t => t.key !== info.type);
      
      for (const type of otherTypes) {
        const { data } = await supabaseAdmin
          .from('products')
          .select('title')
          .ilike('title', `%${type.key}%${info.city}%`)
          .or('category.ilike.%imobiliare%,subcategory.ilike.%imobiliare%')
          .or('status.eq.active,approval_status.eq.approved')
          .limit(1);
        
        if (data && data.length > 0) {
          suggestions.push(`${type.label} în ${cityCapitalized}`);
        }
      }
    }
    
    // 4. PRIORITATE 4: Același tip în alte orașe (doar dacă nu sunt suficiente sugestii)
    if (suggestions.length < 5 && info.type && info.rooms) {
      const otherCities = ['București', 'Brașov', 'Cluj', 'Timișoara', 'Iași', 'Constanța']
        .filter(c => !info.city || c.toLowerCase() !== info.city);
      
      for (const city of otherCities.slice(0, 2)) {
        const searchPattern = `%${info.type}%${info.rooms}%camere%${city.toLowerCase()}%`;
        const { data } = await supabaseAdmin
          .from('products')
          .select('title')
          .ilike('title', searchPattern)
          .or('category.ilike.%imobiliare%,subcategory.ilike.%imobiliare%')
          .or('status.eq.active,approval_status.eq.approved')
          .limit(1);
        
        if (data && data.length > 0) {
          suggestions.push(`${typeLabel} ${info.rooms} camere în ${city}`);
        }
      }
    }
  } catch (error) {
    console.warn('Error generating real estate suggestions:', error);
  }
  
  return suggestions.slice(0, 10);
}

/**
 * Generează sugestii contextuale pentru mașini
 */
async function generateCarSuggestions(
  query: string,
  analysis: ReturnType<typeof analyzeQuery>
): Promise<string[]> {
  const suggestions: string[] = [];
  
  if (!supabaseAdmin || !analysis.brand) {
    return suggestions;
  }
  
  try {
    const brand = analysis.brand.brand;
    const fullBrand = analysis.brand.fullBrand;
    const lowerQuery = query.toLowerCase();
    
    // Detectează model și motorizare din query
    let detectedModel: string | undefined;
    let detectedEngine: string | undefined;
    
    // Modele comune
    const models = ['seria 3', 'seria 5', 'seria 7', 'x3', 'x5', 'x7', 'a3', 'a4', 'a6', 'c class', 'e class', 's class'];
    for (const model of models) {
      if (lowerQuery.includes(model)) {
        detectedModel = model;
        break;
      }
    }
    
    // Motorizare
    const engineMatch = lowerQuery.match(/(\d+\.?\d*)\s*(litri?|l|motor)/i);
    if (engineMatch) {
      detectedEngine = engineMatch[1];
    }
    
    // 1. PRIORITATE 1: Același brand, alte modele (dacă există model în query)
    if (detectedModel) {
      const { data: brandProducts } = await supabaseAdmin
        .from('products')
        .select('title')
        .ilike('title', `%${fullBrand}%`)
        .or('category.ilike.%autovehicule%,subcategory.ilike.%autovehicule%,category.ilike.%auto%,subcategory.ilike.%auto%')
        .or('status.eq.active,approval_status.eq.approved')
        .limit(10);
      
      if (brandProducts && brandProducts.length > 0) {
        const otherModels = new Set<string>();
        brandProducts.forEach(p => {
          const title = p.title?.toLowerCase() || '';
          for (const model of models) {
            if (title.includes(model) && model !== detectedModel) {
              const modelLabel = model.charAt(0).toUpperCase() + model.slice(1);
              otherModels.add(`${fullBrand} ${modelLabel}`);
            }
          }
        });
        
        suggestions.push(...Array.from(otherModels).slice(0, 4));
      }
    } else {
      // Dacă nu există model, sugerează modele populare
      const popularModels = fullBrand === 'BMW' 
        ? ['BMW Seria 3', 'BMW Seria 5', 'BMW X3', 'BMW X5']
        : fullBrand === 'Mercedes-Benz'
        ? ['Mercedes-Benz C Class', 'Mercedes-Benz E Class', 'Mercedes-Benz S Class']
        : fullBrand === 'Audi'
        ? ['Audi A3', 'Audi A4', 'Audi A6', 'Audi Q5']
        : [];
      
      suggestions.push(...popularModels.slice(0, 3));
    }
    
    // 2. PRIORITATE 2: Același brand, același model, alte motorizări (dacă există model și motorizare)
    if (detectedModel && detectedEngine) {
      const { data } = await supabaseAdmin
        .from('products')
        .select('title')
        .ilike('title', `%${fullBrand}%${detectedModel}%`)
        .not('title', 'ilike', `%${detectedEngine}%`)
        .or('category.ilike.%autovehicule%,subcategory.ilike.%autovehicule%,category.ilike.%auto%,subcategory.ilike.%auto%')
        .or('status.eq.active,approval_status.eq.approved')
        .limit(2);
      
      if (data && data.length > 0) {
        data.forEach(p => {
          if (p.title && !suggestions.includes(p.title)) {
            suggestions.push(p.title);
          }
        });
      }
    }
    
    // 3. PRIORITATE 3: Toate produsele brand-ului
    suggestions.push(`Toate produsele ${fullBrand}`);
    
    // 4. PRIORITATE 4: Alte branduri din aceeași categorie (doar dacă nu sunt suficiente sugestii)
    if (suggestions.length < 6) {
      const otherBrands = ['Mercedes-Benz', 'Audi', 'Opel', 'Volkswagen', 'Ford', 'Renault', 'Dacia']
        .filter(b => !b.toLowerCase().includes(brand))
        .slice(0, 3);
      
      suggestions.push(...otherBrands.map(b => `Produse ${b}`));
    }
  } catch (error) {
    console.warn('Error generating car suggestions:', error);
  }
  
  return suggestions.slice(0, 10);
}

/**
 * Generează sugestii contextuale inteligente bazate pe query
 */
export async function generateContextualSuggestions(query: string): Promise<string[]> {
  const searchType = detectSearchType(query);
  const analysis = analyzeQuery(query);
  const suggestions: string[] = [];
  
  try {
    if (searchType.type === 'imobiliare') {
      const info = extractRealEstateInfo(query);
      const realEstateSuggestions = await generateRealEstateSuggestions(query, info);
      suggestions.push(...realEstateSuggestions);
    } else if (searchType.type === 'masini') {
      const carSuggestions = await generateCarSuggestions(query, analysis);
      suggestions.push(...carSuggestions);
    } else {
      // Sugestii generale bazate pe categoria detectată
      if (analysis.category) {
        suggestions.push(`Toate produsele ${analysis.category}`);
        
        if (analysis.brand) {
          suggestions.push(`Produse ${analysis.brand.fullBrand}`);
        }
      }
    }
    
    // Adaugă sugestii din baza de date pentru query-ul actual
    if (supabaseAdmin) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('title, category, subcategory')
        .or(`title.ilike.%${query.toLowerCase()}%,description.ilike.%${query.toLowerCase()}%`)
        .or('status.eq.active,approval_status.eq.approved')
        .not('title', 'is', null)
        .limit(5);
      
      if (products && products.length > 0) {
        // Filtrează duplicatele și adaugă doar cele relevante
        products.forEach(p => {
          if (p.title && !suggestions.includes(p.title)) {
            const category = (p.category || p.subcategory || '').toLowerCase();
            // Verifică dacă este în aceeași categorie
            if (searchType.type === 'imobiliare' && (category.includes('imobiliare') || category.includes('apartament') || category.includes('casa'))) {
              suggestions.push(p.title);
            } else if (searchType.type === 'masini' && (category.includes('auto') || category.includes('autovehicule'))) {
              suggestions.push(p.title);
            } else if (searchType.type === 'general') {
              suggestions.push(p.title);
            }
          }
        });
      }
    }
  } catch (error) {
    console.warn('Error generating contextual suggestions:', error);
  }
  
  return suggestions.slice(0, 10);
}

