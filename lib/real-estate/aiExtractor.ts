import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * AI Extractor - Modulul #1 al Evaluatorului Imobiliar
 * Extrae tip proprietate, criterii și construiește query Google optimizat
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface ExtractedCriteria {
  tip: string; // "apartament" | "casa" | "micro-teren + casă veche" | "teren_intravilan" | "teren_agricol" | "spatiu_comercial" | "hala_industriala" | "proprietate_turistica"
  criterii: {
    oras?: string;
    zona?: string;
    suprafata?: number;
    suprafata_teren?: number;
    camere?: number;
    an?: number;
    an_constructie?: number;
    etaj?: number;
    etaje_totale?: number;
    compartimentare?: string; // "decomandat" | "semidecomandat" | "nedecomandat"
    stare?: string; // "nou" | "renovat" | "vechi"
    structura?: string; // "beton" | "caramida" | "lemn"
    niveluri?: string; // "P" | "P+1" | "P+M"
    utilitati?: string[]; // ["apa", "gaz", "curent", "canalizare"]
    front_stradal?: number;
    regim_urbanistic?: string;
    intravilan_extravilan?: string; // "intravilan" | "extravilan"
    categoria_teren?: string; // "arabil" | "faneata" | "pasune"
    tip_spatiu?: string; // "stradal" | "mall" | "etaj_1" | "birouri"
    vitrina?: boolean;
    trafic_pietonal?: string; // "mare" | "mediu" | "mic"
    suprafata_hala?: number;
    inaltime?: number;
    acces_tir?: boolean;
    clasificare?: string; // "stele" | "margarete"
    numar_camere?: number;
    facilitati?: string[];
    categorie_speciala?: string; // "micro-teren" | "casă veche" | "executare silită"
  };
  licitatie?: boolean; // true dacă este licitație ANAF / executare silită
  query_google: string;
  observatii?: string;
}

/**
 * Extrage criterii imobiliare din anunț folosind GPT-4o
 */
export async function extractRealEstateCriteria(
  title: string,
  description?: string,
  userFields?: Record<string, any>
): Promise<ExtractedCriteria> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const systemPrompt = `Ești modulul #1 al Evaluatorului Imobiliar.

Sarcina ta:
1. Identifici tipul proprietății.
2. Extragi criteriile relevante.
3. Detectezi cazuri speciale:
   - teren foarte mic (<150 mp) → tip_proprietate = "micro-teren + casă veche"
   - casă veche (dacă nu există an construcție sau renovări menționate)
   - executare silită / ANAF / licitație (dacă textul conține: "licitație", "executare", "anaf", "preț de pornire", "preț evaluare")
4. Construiești query-ul corect pentru căutare, fără interpretări greșite.
5. Returnezi STRICT JSON.

REGULI SPECIALE OBLIGATORII:

🔹 Regula 1 — Teren foarte mic (<150 mp)
Dacă suprafata_teren < 150 mp, atunci:
- tip_proprietate = "micro-teren + casă veche"
- categorie_speciala = "micro-teren"
- NU include în query vile, case noi, case cu teren mare

🔹 Regula 2 — Modul „EXECUTARE SILITĂ / ANAF"
Dacă textul conține oricare dintre: "licitație", "executare", "anaf", "preț de pornire", "preț evaluare":
- licitatie = true
- categorie_speciala = "executare silită"

🔹 Regula 3 — Casă veche
Dacă descrierea NU menționează: an construcție, renovări, structură beton, acoperiș nou:
- categorie_speciala = "casă veche"
- stare = "vechi"

🔹 Regula 4 — Orașul trebuie să fie EXACT localitatea detectată
- Pentru "Breaza" → oras = "Breaza", NU "Prahova"
- Pentru "Sinaia" → oras = "Sinaia", NU "Prahova"
- NU include județul în oraș

🔹 Regula 5 — Query-ul NU trebuie să includă:
- vile premium
- case noi
- spații comerciale
- terenuri mari (>500 mp)

Tipuri de proprietăți:
- "apartament": apartamente în bloc
- "casa": case și vile
- "micro-teren + casă veche": case cu teren <150 mp
- "teren_intravilan": terenuri intravilan
- "teren_agricol": terenuri agricole
- "spatiu_comercial": spații comerciale
- "hala_industriala": hale industriale
- "proprietate_turistica": pensiuni, hoteluri

Răspunde STRICT în format JSON, fără text suplimentar.`;

  const userPrompt = `Analizează următorul anunț imobiliar și extrage criteriile:

Titlu: ${title}
${description ? `Descriere: ${description.substring(0, 1000)}` : ''}
${userFields ? `Câmpuri utilizator: ${JSON.stringify(userFields)}` : ''}

Extrage:
1. Tipul proprietății
2. Toate criteriile relevante
3. Query optimizat pentru Google Search (format: "apartament 2 camere 54 mp Militari Bucuresti 2015 de vanzare bloc nou")
4. Observații (dacă există informații incomplete sau ambigue)

Răspunde în format JSON:
{
  "tip": "apartament",
  "criterii": {
    "oras": "București",
    "zona": "Militari",
    "suprafata": 54,
    "camere": 2,
    "an": 2015,
    "an_constructie": 2015,
    "etaj": 6,
    "etaje_totale": 8,
    "compartimentare": "decomandat",
    "stare": "nou",
    "categorie_speciala": ""
  },
  "licitatie": false,
  "query_google": "apartament 2 camere 54 mp Militari Bucuresti 2015 de vanzare bloc nou",
  "observatii": ""
}

IMPORTANT:
- Dacă teren <150 mp → tip = "micro-teren + casă veche", categorie_speciala = "micro-teren"
- Dacă detectezi licitație/ANAF → licitatie = true, categorie_speciala = "executare silită"
- Dacă casă veche → categorie_speciala = "casă veche"
- Orașul trebuie să fie EXACT localitatea (ex: "Breaza", nu "Prahova")`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
    const extracted = JSON.parse(responseText) as ExtractedCriteria;

    // Validare și normalizare
    if (!extracted.tip) {
      throw new Error('Tip proprietate nu a fost extras');
    }

    if (!extracted.query_google) {
      // Construiește query fallback
      extracted.query_google = buildFallbackQuery(extracted);
    }

    return extracted;
  } catch (error: any) {
    console.error('[AI Extractor] Error:', error);
    
    // Fallback: extrage manual cât se poate
    return buildFallbackExtraction(title, description, userFields);
  }
}

/**
 * Construiește query fallback dacă AI nu reușește
 */
function buildFallbackQuery(extracted: ExtractedCriteria): string {
  const parts: string[] = [];
  
  if (extracted.tip === 'apartament') {
    parts.push('apartament');
    if (extracted.criterii.camere) parts.push(`${extracted.criterii.camere} camere`);
    if (extracted.criterii.suprafata) parts.push(`${extracted.criterii.suprafata} mp`);
    if (extracted.criterii.zona) parts.push(extracted.criterii.zona);
    if (extracted.criterii.oras) parts.push(extracted.criterii.oras);
    if (extracted.criterii.an) parts.push(extracted.criterii.an.toString());
  } else if (extracted.tip === 'casa' || extracted.tip === 'micro-teren + casă veche') {
    if (extracted.tip === 'micro-teren + casă veche') {
      parts.push('casa');
      if (extracted.criterii.suprafata_teren) parts.push(`teren ${extracted.criterii.suprafata_teren} mp`);
    } else {
      parts.push('casa');
      if (extracted.criterii.suprafata) parts.push(`${extracted.criterii.suprafata} mp`);
      if (extracted.criterii.suprafata_teren) parts.push(`${extracted.criterii.suprafata_teren} mp teren`);
    }
    if (extracted.criterii.zona) parts.push(extracted.criterii.zona);
    if (extracted.criterii.oras) parts.push(extracted.criterii.oras);
    // Pentru micro-teren sau casă veche, adaugă termeni de căutare specifici
    if (extracted.criterii.categorie_speciala === 'micro-teren') {
      parts.push('teren mic');
    } else if (extracted.criterii.categorie_speciala === 'casă veche') {
      parts.push('casa veche');
    }
  } else if (extracted.tip === 'teren_intravilan') {
    parts.push('teren intravilan');
    if (extracted.criterii.suprafata) parts.push(`${extracted.criterii.suprafata} mp`);
    if (extracted.criterii.oras) parts.push(extracted.criterii.oras);
  } else if (extracted.tip === 'teren_agricol') {
    parts.push('teren agricol');
    if (extracted.criterii.suprafata) parts.push(`${extracted.criterii.suprafata} ha`);
    if (extracted.criterii.oras) parts.push(extracted.criterii.oras);
  }
  
  // NU adăuga "de vanzare" dacă este licitație (pentru a evita confuzia)
  if (!extracted.licitatie) {
    parts.push('de vanzare');
  }
  
  return parts.join(' ');
}

/**
 * Extrage manual cât se poate dacă AI eșuează
 */
function buildFallbackExtraction(
  title: string,
  description?: string,
  userFields?: Record<string, any>
): ExtractedCriteria {
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const fullText = `${title} ${description || ''}`.toLowerCase();
  
  // Detectare licitație / executare silită
  const isLicitatie = fullText.includes('licitație') || fullText.includes('licitatie') ||
                      fullText.includes('executare') || fullText.includes('anaf') ||
                      fullText.includes('preț de pornire') || fullText.includes('pret de pornire') ||
                      fullText.includes('preț evaluare') || fullText.includes('pret evaluare');
  
  let tip = 'apartament'; // Default
  let categorieSpeciala = '';
  
  // Extrage suprafață teren
  const terenMatch = fullText.match(/(\d+)\s*(?:mp|m²|metri)\s*(?:teren|terenu)/i) || 
                     fullText.match(/teren[:\s]+(\d+)\s*(?:mp|m²)/i);
  const suprafataTeren = terenMatch ? parseInt(terenMatch[1]) : undefined;
  
  // REGULA 1: Micro-teren (<150 mp)
  if (suprafataTeren && suprafataTeren < 150) {
    tip = 'micro-teren + casă veche';
    categorieSpeciala = 'micro-teren';
  } else if (titleLower.includes('casă') || titleLower.includes('casa') || titleLower.includes('vila')) {
    tip = 'casa';
    
    // REGULA 3: Casă veche (dacă nu există an construcție sau renovări)
    const hasAnConstructie = fullText.match(/(?:an|anul|construit|construcție)[:\s]+(\d{4})/i);
    const hasRenovari = fullText.includes('renovat') || fullText.includes('renovație') ||
                        fullText.includes('structură beton') || fullText.includes('structura beton') ||
                        fullText.includes('acoperiș nou') || fullText.includes('acoperis nou');
    
    if (!hasAnConstructie && !hasRenovari) {
      categorieSpeciala = 'casă veche';
    }
  } else if (titleLower.includes('teren') && (titleLower.includes('agricol') || titleLower.includes('arabil'))) {
    tip = 'teren_agricol';
  } else if (titleLower.includes('teren')) {
    tip = 'teren_intravilan';
  } else if (titleLower.includes('spațiu comercial') || titleLower.includes('spatiu comercial')) {
    tip = 'spatiu_comercial';
  } else if (titleLower.includes('hală') || titleLower.includes('hala') || titleLower.includes('industrial')) {
    tip = 'hala_industriala';
  } else if (titleLower.includes('pensiune') || titleLower.includes('hotel')) {
    tip = 'proprietate_turistica';
  }
  
  const criterii: ExtractedCriteria['criterii'] = {
    ...userFields,
    categorie_speciala: categorieSpeciala || undefined,
    suprafata_teren: suprafataTeren,
  };
  
  // Extrage numere din text
  const suprafataMatch = title.match(/(\d+)\s*(?:mp|m²|metri|metri pătrați)/i) || descLower.match(/(\d+)\s*(?:mp|m²)/i);
  if (suprafataMatch) {
    criterii.suprafata = parseInt(suprafataMatch[1]);
  }
  
  const camereMatch = title.match(/(\d+)\s*camere?/i) || descLower.match(/(\d+)\s*camere?/i);
  if (camereMatch) {
    criterii.camere = parseInt(camereMatch[1]);
  }
  
  // Extrage oraș (exact localitatea, nu județul)
  const orasMatch = fullText.match(/(?:în|in|la|din)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+)/);
  if (orasMatch) {
    const potentialOras = orasMatch[1];
    // Verifică dacă nu este județ
    const judete = ['prahova', 'bucurești', 'bucuresti', 'cluj', 'timis', 'constanta', 'iasi', 'brasov'];
    if (!judete.includes(potentialOras.toLowerCase())) {
      criterii.oras = potentialOras;
    }
  }
  
  const extracted: ExtractedCriteria = {
    tip,
    criterii,
    licitatie: isLicitatie,
    query_google: '',
    observatii: 'Extragere fallback - informații limitate',
  };
  
  // Construiește query-ul după ce obiectul este complet
  extracted.query_google = buildFallbackQuery(extracted);
  
  return extracted;
}

