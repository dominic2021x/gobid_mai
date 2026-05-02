import descriptionTemplates from '@/app/(site)/dashboard/my-products/description-templates.json';

interface TemplateData {
  requiredFields: string[];
  templates: Array<{ pattern: string }>;
  fieldExtractors: Record<string, string[]>;
}

interface ExtractedFields {
  [key: string]: string;
}

/**
 * Extrage câmpuri din textul vocal folosind regex-uri și cuvinte cheie
 */
function extractFields(text: string, extractors: Record<string, string[]>): ExtractedFields {
  const extracted: ExtractedFields = {};
  const lowerText = text.toLowerCase();
  const normalizedText = text.replace(/[^\w\s]/g, ' ').toLowerCase();

  for (const [field, patterns] of Object.entries(extractors)) {
    let found = false;
    
    for (const pattern of patterns) {
      // Dacă pattern-ul este un regex (conține \d sau caractere speciale)
      if (pattern.includes('\\d') || pattern.includes('\\s') || pattern.includes('[') || pattern.includes('\\')) {
        try {
          // Îmbunătățește regex-urile pentru a fi mai precise
          let regexPattern = pattern;
          
          // Pentru pattern-uri simple cu numere, adaugă word boundaries
          if (pattern === '\\d+') {
            regexPattern = '\\b\\d+\\b';
          } else if (pattern.includes('\\d+\\s*gb')) {
            regexPattern = '\\b\\d+\\s*(gb|giga|gigabyte)\\b';
          } else if (pattern.includes('\\d+%')) {
            regexPattern = '\\b\\d+\\s*%\\b';
          } else if (pattern.includes('\\d{4}')) {
            regexPattern = '\\b(19|20)\\d{2}\\b';
          } else if (pattern.includes('\\d+\\s*km')) {
            regexPattern = '\\b\\d+[\\s,.]*\\d*\\s*(km|kilometri|mii)\\b';
          }
          
          const regex = new RegExp(regexPattern, 'gi');
          const match = text.match(regex);
          if (match && match[0]) {
            extracted[field] = match[0].trim();
            found = true;
            break;
          }
        } catch (e) {
          // Dacă regex-ul e invalid, continuă
        }
      } else {
        // Căutare precisă de cuvânt - verifică dacă apare ca cuvânt complet sau în context
        const patternLower = pattern.toLowerCase();
        
        // Verifică dacă apare ca cuvânt complet (cu word boundaries)
        const wordBoundaryRegex = new RegExp(`\\b${patternLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundaryRegex.test(text)) {
          extracted[field] = pattern;
          found = true;
          break;
        }
        
        // Verifică dacă apare în text (fără word boundaries pentru flexibilitate)
        if (lowerText.includes(patternLower)) {
          extracted[field] = pattern;
          found = true;
          break;
        }
      }
    }
  }

  // Extrage informații suplimentare din text pentru câmpuri comune - EXTREM DE PRECIS
  
  // Marca pentru telefoane - verifică exact
  if (!extracted.marca) {
    const marcaPatterns = [
      { pattern: /\biphone\b/i, value: 'iPhone' },
      { pattern: /\bsamsung\b/i, value: 'Samsung' },
      { pattern: /\bxiaomi\b/i, value: 'Xiaomi' },
      { pattern: /\bhuawei\b/i, value: 'Huawei' },
      { pattern: /\boppo\b/i, value: 'Oppo' },
      { pattern: /\boneplus\b/i, value: 'OnePlus' },
      { pattern: /\brealme\b/i, value: 'Realme' },
      { pattern: /\bgoogle\s*pixel\b/i, value: 'Google Pixel' },
      { pattern: /\bnokia\b/i, value: 'Nokia' }
    ];
    for (const { pattern, value } of marcaPatterns) {
      if (pattern.test(text)) {
        extracted.marca = value;
        break;
      }
    }
  }

  // Model pentru telefoane - extrage numărul modelului
  if (!extracted.model && extracted.marca) {
    const modelMatch = text.match(/\b(\d+|pro|max|plus|mini|ultra|lite|se)\b/i);
    if (modelMatch) {
      extracted.model = modelMatch[1];
    }
  }

  // Capacitate pentru telefoane - foarte precis
  if (!extracted.capacitate) {
    const capacityMatch = text.match(/\b(\d+)\s*(gb|giga|gigabyte)\b/i);
    if (capacityMatch) {
      extracted.capacitate = `${capacityMatch[1]} GB`;
    }
  }

  // Baterie pentru telefoane - foarte precis
  if (!extracted.baterie) {
    const batteryMatch = text.match(/\b(\d{1,3})\s*%\b/i);
    if (batteryMatch && parseInt(batteryMatch[1]) <= 100) {
      extracted.baterie = `${batteryMatch[1]}%`;
    }
  }

  // Culoare - verifică în context
  if (!extracted.culoare) {
    const culoarePatterns = [
      { pattern: /\bnegru\b/i, value: 'negru' },
      { pattern: /\b(alb|albă)\b/i, value: 'alb' },
      { pattern: /\b(gri|gri)\b/i, value: 'gri' },
      { pattern: /\b(auriu|aur)\b/i, value: 'auriu' },
      { pattern: /\b(albastru|albastră)\b/i, value: 'albastru' },
      { pattern: /\broz\b/i, value: 'roz' },
      { pattern: /\bverde\b/i, value: 'verde' },
      { pattern: /\bmov\b/i, value: 'mov' }
    ];
    for (const { pattern, value } of culoarePatterns) {
      if (pattern.test(text)) {
        extracted.culoare = value;
        break;
      }
    }
  }

  // Stare - verifică în context
  if (!extracted.stare) {
    const starePatterns = [
      { pattern: /\b(excelentă|excelent)\b/i, value: 'excelentă' },
      { pattern: /\bfoarte\s+bună\b/i, value: 'foarte bună' },
      { pattern: /\bbună\b/i, value: 'bună' },
      { pattern: /\bperfectă\b/i, value: 'perfectă' },
      { pattern: /\bca\s+nou\b/i, value: 'ca nou' },
      { pattern: /\bfolosit\b/i, value: 'folosit' },
      { pattern: /\buzat\b/i, value: 'uzat' }
    ];
    for (const { pattern, value } of starePatterns) {
      if (pattern.test(text)) {
        extracted.stare = value;
        break;
      }
    }
  }

  // Deblocat - verifică în context
  if (!extracted.deblocat) {
    if (/\bdeblocat\b/i.test(text) || /\bliber\b/i.test(text) || /\bîn\s+orice\s+rețea\b/i.test(text)) {
      extracted.deblocat = 'deblocat';
    } else if (/\bblocat\b/i.test(text)) {
      extracted.deblocat = 'blocat';
    }
  }

  // iCloud - verifică în context
  if (!extracted.iCloud) {
    if (/\b(șters|ștearsă|ștersă)\b/i.test(text) || /\bpregătit\b/i.test(text)) {
      extracted.iCloud = 'șters';
    } else if (/\bactiv\b/i.test(text)) {
      extracted.iCloud = 'activ';
    } else if (/\bdezactivat\b/i.test(text)) {
      extracted.iCloud = 'dezactivat';
    }
  }

  // Accesorii - verifică ce accesorii sunt menționate
  if (!extracted.accesorii) {
    const accesoriiList: string[] = [];
    if (/\bcutie\b/i.test(text)) accesoriiList.push('cutie');
    if (/\b(cablu|încărcător)\b/i.test(text)) accesoriiList.push('cablu de încărcare');
    if (/\bîncărcător\b/i.test(text) && !accesoriiList.includes('cablu de încărcare')) accesoriiList.push('încărcător');
    if (/\b(carcasă|husă)\b/i.test(text)) accesoriiList.push('carcasă');
    if (/\bfolie\b/i.test(text)) accesoriiList.push('folie protecție');
    if (accesoriiList.length > 0) {
      extracted.accesorii = accesoriiList.join(', ');
    }
  }

  return extracted;
}

/**
 * Completează un template cu câmpurile extrase
 */
export function fillTemplate(template: string, fields: ExtractedFields, defaultValues: Record<string, string> = {}): string {
  let result = template;
  const allFields = { ...defaultValues, ...fields };

  // Înlocuiește placeholder-urile
  for (const [key, value] of Object.entries(allFields)) {
    const placeholder = `{${key}}`;
    if (result.includes(placeholder)) {
      result = result.replace(new RegExp(placeholder, 'g'), value || `[${key} lipsă]`);
    }
  }

  // Procesează câmpuri speciale
  if (result.includes('{baterieStatus}')) {
    const baterie = parseInt(fields.baterie || '0');
    const status = baterie >= 90 ? 'excelentă' : baterie >= 80 ? 'foarte bună' : baterie >= 70 ? 'bună' : 'acceptabilă';
    result = result.replace(/{baterieStatus}/g, status);
  }

  return result;
}

/**
 * Procesează descrierea vocală și o transformă într-o descriere structurată
 */
export function processVoiceDescription(
  voiceText: string,
  category: string,
  subcategory: string
): { description: string; missingFields: string[]; extractedFields: Record<string, string> } {
  const templates = descriptionTemplates as Record<string, Record<string, TemplateData>>;
  
  // Găsește template-ul pentru categorie și subcategorie
  const categoryData = templates[category];
  if (!categoryData) {
    return { description: voiceText, missingFields: [], extractedFields: {} };
  }

  const subcategoryData = categoryData[subcategory];
  if (!subcategoryData) {
    return { description: voiceText, missingFields: [], extractedFields: {} };
  }

  // Extrage câmpurile din textul vocal
  const extractedFields = extractFields(voiceText, subcategoryData.fieldExtractors);

  // Identifică câmpurile lipsă
  const missingFields = subcategoryData.requiredFields.filter(
    field => !extractedFields[field] || extractedFields[field] === `[${field} lipsă]` || extractedFields[field].includes('lipsă')
  );

  // Alege un template aleator
  const randomTemplate = subcategoryData.templates[
    Math.floor(Math.random() * subcategoryData.templates.length)
  ];

  // Completează template-ul
  const description = fillTemplate(randomTemplate.pattern, extractedFields);

  return { description, missingFields, extractedFields };
}

/**
 * Verifică dacă textul conține comenzi de finalizare
 */
export function isCompletionCommand(text: string): boolean {
  const completionPatterns = [
    /gata\s+am\s+terminat/i,
    /gata\s+terminat/i,
    /am\s+terminat/i,
    /terminat/i,
    /gata\s+descrierea/i,
    /gata\s+descriere/i,
    /finalizat/i,
    /gata/i
  ];

  return completionPatterns.some(pattern => pattern.test(text));
}

/**
 * Extrage prețul din descriere
 * Evită să combine numere din modele de mașini (ex: "x5", "e46") cu prețul
 */
export function extractPrice(text: string): { price: number | null; currency: 'RON' | 'EUR' } {
  // Pattern-uri pentru preț: "preț 1800", "1800 lei", "1800 ron", etc.
  // Prioritizăm pattern-urile care conțin cuvinte cheie de preț
  const pricePatterns = [
    // Pattern 1: "preț 1800 ron", "prețul este de 1800 lei" - cel mai sigur
    /\b(preț|pret|prețul|pretul|price|prețul\s+este\s+de|pretul\s+este\s+de)\s+(\d{3,}[\s,.]*\d*)\s*(lei|ron|eur|euro)?/gi,
    // Pattern 2: "costa 1800 ron", "costă 1800 ron"
    /\b(costa|costă|cost)\s+(\d{3,}[\s,.]*\d*)\s*(lei|ron|eur|euro)?/gi,
    // Pattern 3: "1800 ron", "1800 lei" - dar verificăm contextul pentru a evita modele de mașini
    /\b(\d{3,}[\s,.]*\d*)\s+(lei|ron|eur|euro)\b/gi,
    // Pattern 4: "1800 de lei", "1800 de ron"
    /\b(\d{3,}[\s,.]*\d*)\s+de\s+(lei|ron|eur|euro)\b/gi,
  ];

  // Încearcă fiecare pattern în ordine
  for (const pattern of pricePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    
    for (const match of matches) {
      // Extrage numărul (poate fi în match[1] sau match[2] în funcție de pattern)
      const numberStr = match[1] || match[2];
      if (!numberStr) continue;
      
      // Curăță numărul (elimină spații, virgule, păstrează doar cifre și punct)
      const cleanNumberStr = numberStr.replace(/[\s,]/g, '').replace(',', '.');
      const price = parseFloat(cleanNumberStr);
      
      // Validare: prețul trebuie să fie între 10 și 10.000.000
      if (!isNaN(price) && price >= 10 && price <= 10000000) {
        // Verifică contextul pentru a evita numere din modele de mașini
        const matchIndex = match.index || 0;
        const beforeMatch = text.substring(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
        
        // Verifică dacă înainte de număr există un model de mașină (ex: "x5", "e46", "a4")
        // Pattern pentru modele: literă urmată de cifre sau cifre urmate de literă
        const carModelBefore = /\b([a-z]{1,2}\d{1,3}|\d{1,3}[a-z]{1,2})\s*$/i.test(beforeMatch);
        
        // Dacă există model de mașină înainte și prețul este mic (< 1000), probabil este parte din model
        if (carModelBefore && price < 1000) {
          // Verifică dacă există un spațiu între model și număr (dacă nu, probabil face parte din model)
          const textBeforeNumber = text.substring(Math.max(0, matchIndex - 10), matchIndex);
          if (!/\s/.test(textBeforeNumber)) {
            // Nu există spațiu, probabil face parte din model (ex: "x5" nu "x 5")
            continue;
          }
        }
        
        // Verifică dacă numărul nu este parte dintr-un model de mașină (ex: "x5", "e46")
        // Dacă numărul este urmat imediat de o literă sau precedat de o literă fără spațiu, ignoră
        const afterMatch = text.substring(matchIndex + match[0].length, Math.min(text.length, matchIndex + match[0].length + 5));
        if (/^[a-z]/i.test(afterMatch.trim())) {
          // Numărul este urmat de o literă, probabil face parte dintr-un model
          continue;
        }
        
        const currency = /(eur|euro)/i.test(match[0]) ? 'EUR' : 'RON';
        return { price, currency };
      }
    }
  }

  return { price: null, currency: 'RON' };
}

/**
 * Elimină prețul din descriere și propozițiile care conțin prețul
 */
export function removePriceFromDescription(text: string): string {
  let cleaned = text;
  
  // Pattern-uri pentru propoziții complete care conțin prețul
  const priceSentencePatterns = [
    // "prețul este de 1800 ron", "prețul este de 1800 euro"
    /\b(prețul|pretul|preț|pret|price)\s+(este\s+)?(de\s+)?\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
    // "preț 1800 ron", "preț 1800 euro"
    /\b(preț|pret|price)\s+\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
    // "1800 ron", "1800 euro" (standalone)
    /\b\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
    // "1800 de lei", "1800 de euro"
    /\b\d+[\s,.]*\d*\s+de\s+(lei|ron|eur|euro)\b/gi,
    // "costa 1800 ron", "costă 1800 ron"
    /\b(costa|costă|cost)\s+\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
    // "vand cu 1800 ron", "vând cu 1800 ron"
    /\b(vand|vând)\s+cu\s+\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
    // "la pret de 1800 ron", "la preț de 1800 ron"
    /\bla\s+(pret|preț|price)\s+de\s+\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi,
  ];
  
  // Elimină propozițiile complete care conțin prețul
  for (const pattern of priceSentencePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Elimină și pattern-urile simple de preț (fallback)
  cleaned = cleaned
    .replace(/\b(preț|pret|price)\s*\d+[\s,.]*\d*\s*(lei|ron|eur|euro)?/gi, '')
    .replace(/\b\d+\s*(lei|ron|eur|euro)\b/gi, '')
    .replace(/\b\d+[\s,.]*\d*\s*(lei|ron|eur|euro)\b/gi, '')
    .replace(/\b\d+[\s,.]*\d*\s*(de\s*)?(lei|ron|eur|euro)\b/gi, '');
  
  // Curăță spațiile multiple și virgulele duble
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\.\s*,/g, ',')
    .trim();
  
  return cleaned;
}
