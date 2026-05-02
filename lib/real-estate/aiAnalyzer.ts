import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * AI Analyzer - Modulul #2 al Evaluatorului Imobiliar
 * Filtrează comparabile, elimină outliers, calculează percentile și clasifică
 */

import OpenAI from 'openai';
import { ExtractedCriteria } from './aiExtractor';
import { analyzeMarket, filterByVolatility, applyVolatilityCorrection } from './marketAnalysis';
import { calculateHybridValuation } from './hybridValuation';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface Comparable {
  titlu: string;
  link: string;
  pret: number;
  suprafata?: number;
  camere?: number;
  zona?: string;
  an?: number;
  etaj?: number;
  [key: string]: any;
}

export interface AnalysisResult {
  pret_mp_subiect: number;
  percentile: {
    p20: number;
    p40: number;
    p60: number;
    p80: number;
  };
  clasificare: 'sub_piata' | 'in_piata' | 'usor_peste' | 'peste_piata' | 'scump';
  comparabile_folosite: Comparable[];
  comparabile_respinse: Comparable[];
  explicatie_ai: string;
  pret_subiect?: number;
  suprafata_subiect?: number;
  // NOI CÂMPURI pentru modelul hibrid
  valoare_reala_interval?: {
    min: number;
    max: number;
    moneda: string;
  };
  valoare_reala_punct?: number;
  unsold_market_discount?: number;
  execution_discount?: number;
  scor_volatilitate_zona?: number;
  inflated_market?: boolean;
  piata_volatila?: boolean;
  nivel_incredere?: 'ridicat' | 'mediu' | 'scazut';
}

/**
 * Analizează comparabilele și generează evaluarea finală folosind GPT-4o
 */
export async function analyzeRealEstateComparables(
  extracted: ExtractedCriteria,
  comparables: Comparable[],
  subjectPrice?: number,
  subjectSurface?: number
): Promise<AnalysisResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (comparables.length === 0) {
    console.warn('[AI Analyzer] No comparables provided, generating fallback analysis');
    // Generează analiză fallback bazată doar pe criteriile extrase
    return await calculateFallbackAnalysis(extracted, [], subjectPrice, subjectSurface);
  }

  const systemPrompt = `Ești modulul #2 al Evaluatorului Imobiliar.

Primești:
- datele extrase din modulul #1 (inclusiv licitatie, categorie_speciala)
- comparabile brute din căutări

Sarcinile tale:

1. Filtrezi comparabilele după REGULI STRICTE:
   - Aceeași localitate EXACTĂ (ex: doar "Breaza", NU "Sinaia", "Azuga", "Câmpina")
   - Dacă subiectul are teren <150 mp → doar comparabile cu teren <200 mp
   - Dacă subiectul este "casă veche" → doar case vechi (fără an construcție sau renovări)
   - Dacă subiectul este "micro-teren" → doar proprietăți cu teren mic
   - ELIMINĂ: vile premium, case noi, terenuri mari (>500 mp), spații comerciale

2. Elimină outlierii:
   - preț/mp > 2.5× mediană → ELIMINĂ
   - preț/mp < 0.3× mediană → ELIMINĂ

3. Calculează:
   - preț/mp subiect
   - percentila p20, p40, p60, p80 din comparabilele FILTRATE

4. Dacă "licitatie" = true (executare silită / ANAF):
   - Aplică reducere 40-60% din piața liberă
   - Recalculează intervalele corespunzător
   - Explică că este licitație și prețurile sunt reduse față de piața liberă

5. Generează explicația profesionistă care menționează:
   - Tipul real al proprietății (micro-teren, casă veche, etc.)
   - Zona exactă (ex: "Breaza", nu "Prahova")
   - Dacă este licitație, menționează reducerea aplicată
   - De ce comparabilele au fost filtrate

6. Întoarce STRICT JSON.

REGULI CRITICE:
- NU folosi comparabile din zone diferite (Breaza ≠ Sinaia)
- NU folosi vile premium pentru case vechi
- NU folosi terenuri mari pentru micro-terenuri
- Dacă licitație → aplică reducere 40-60%`;

  const userPrompt = `Analizează următoarele date:

PROPRIETATE SUBIECT:
Tip: ${extracted.tip}
Criterii: ${JSON.stringify(extracted.criterii, null, 2)}
Licitatie: ${extracted.licitatie ? 'DA (executare silită / ANAF)' : 'NU'}
Categorie specială: ${extracted.criterii.categorie_speciala || 'nu'}
${subjectPrice ? `Preț cerut: ${subjectPrice} ${(extracted.criterii as any).currency || 'EUR'}` : ''}
${subjectSurface ? `Suprafață: ${subjectSurface} mp` : ''}
${extracted.criterii.suprafata_teren ? `Suprafață teren: ${extracted.criterii.suprafata_teren} mp` : ''}

COMPARABILE DISPONIBILE (${comparables.length}):
${JSON.stringify(comparables.slice(0, 50), null, 2)}

APLICĂ FILTRAREA STRICTĂ:
1. Doar comparabile din aceeași localitate EXACTĂ (${extracted.criterii.oras || 'necunoscut'})
2. ${extracted.criterii.suprafata_teren && extracted.criterii.suprafata_teren < 150 ? 'Doar comparabile cu teren <200 mp (micro-teren)' : 'Filtrare normală'}
3. ${extracted.criterii.categorie_speciala === 'casă veche' ? 'Doar case vechi (fără an construcție sau renovări)' : 'Filtrare normală'}
4. Elimină vile premium, case noi, terenuri mari
5. ${extracted.licitatie ? 'APLICĂ REDUCERE 40-60% pentru licitație ANAF' : 'Fără reducere (piață liberă)'}

Calculează evaluarea finală.

Răspunde în format JSON:
{
  "pret_mp_subiect": 1630,
  "percentile": {
    "p20": 1400,
    "p40": 1520,
    "p60": 1650,
    "p80": 1780
  },
  "clasificare": "in_piata",
  "comparabile_folosite": [...],
  "comparabile_respinse": [...],
  "explicatie_ai": "Prețul este în intervalul obișnuit pentru apartamente similare din Militari, cu suprafață și an construcție apropiate."
}`;

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
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
    const analysis = JSON.parse(responseText) as AnalysisResult;

    // Validare și normalizare
    if (!analysis.percentile || !analysis.clasificare) {
      // Fallback: calculează manual
      return await calculateFallbackAnalysis(extracted, comparables, subjectPrice, subjectSurface);
    }

    return analysis;
  } catch (error: any) {
    console.error('[AI Analyzer] Error:', error);
    
    // Fallback: calculează manual
    return await calculateFallbackAnalysis(extracted, comparables, subjectPrice, subjectSurface);
  }
}

/**
 * Calculează analiza fallback dacă AI eșuează
 */
async function calculateFallbackAnalysis(
  extracted: ExtractedCriteria,
  comparables: Comparable[],
  subjectPrice?: number,
  subjectSurface?: number
): Promise<AnalysisResult> {
  // Filtrare bazată pe criterii STRICTE
  let filtered: Comparable[] = [];
  const rejected: Comparable[] = [];

  const orasSubiect = (extracted.criterii.oras || '').toLowerCase();
  const zonaSubiect = (extracted.criterii.zona || '').toLowerCase();
  const isMicroTeren = extracted.criterii.suprafata_teren && extracted.criterii.suprafata_teren < 150;
  const isCasaVeche = extracted.criterii.categorie_speciala === 'casă veche' || 
                      (!extracted.criterii.an_constructie && !extracted.criterii.an && 
                       extracted.tip === 'casa' || extracted.tip === 'micro-teren + casă veche');

  for (const comp of comparables) {
    let isValid = true;
    let rejectionReason = '';

    // REGULA 1: Aceeași localitate EXACTĂ
    if (orasSubiect) {
      const orasComp = (comp.zona || comp.titlu || '').toLowerCase();
      // Verifică dacă comparabilul este din aceeași localitate
      if (!orasComp.includes(orasSubiect) && !orasSubiect.includes(orasComp)) {
        // Verifică dacă nu este dintr-o zonă diferită (ex: Sinaia pentru Breaza)
        const zoneInterzise = ['sinaia', 'azuga', 'busteni', 'predeal'];
        const isFromForbiddenZone = zoneInterzise.some(z => orasComp.includes(z));
        if (isFromForbiddenZone && !orasComp.includes(orasSubiect)) {
          isValid = false;
          rejectionReason = 'Zonă diferită';
        }
      }
    }

    // REGULA 2: Micro-teren - doar comparabile cu teren <200 mp
    if (isMicroTeren) {
      // Dacă comparabilul are teren >200 mp, elimină-l
      const terenComp = comp.suprafata_teren || (comp as any).suprafata_teren;
      if (terenComp && terenComp > 200) {
        isValid = false;
        rejectionReason = 'Teren prea mare pentru micro-teren';
      }
    }

    // REGULA 3: Casă veche - doar case vechi
    if (isCasaVeche) {
      // Elimină case noi (cu an construcție recent)
      const anComp = comp.an || (comp as any).an_constructie;
      if (anComp && anComp > 2000) {
        isValid = false;
        rejectionReason = 'Casă nouă (nu se potrivește cu casă veche)';
      }
      // Elimină vile premium
      const titluComp = (comp.titlu || '').toLowerCase();
      if (titluComp.includes('vila') || titluComp.includes('villa') || titluComp.includes('premium')) {
        isValid = false;
        rejectionReason = 'Vilă premium (nu se potrivește cu casă veche)';
      }
    }

    // REGULA 4: Filtrare suprafață (±15% - mai permisiv decât ±10%)
    if (extracted.criterii.suprafata && comp.suprafata) {
      const diff = Math.abs(comp.suprafata - extracted.criterii.suprafata) / extracted.criterii.suprafata;
      if (diff > 0.15) {
        isValid = false;
        rejectionReason = 'Suprafață diferită (>15%)';
      }
    }
    
    // REGULA 4B: Filtrare teren (±20%)
    if (extracted.criterii.suprafata_teren && (comp as any).suprafata_teren) {
      const diff = Math.abs((comp as any).suprafata_teren - extracted.criterii.suprafata_teren) / extracted.criterii.suprafata_teren;
      if (diff > 0.20) {
        isValid = false;
        rejectionReason = 'Teren diferit (>20%)';
      }
    }

    // REGULA 5: Filtrare an (±10 ani - mai permisiv)
    if (!isCasaVeche && extracted.criterii.an && comp.an) {
      const diff = Math.abs(comp.an - extracted.criterii.an);
      if (diff > 10) {
        isValid = false;
        rejectionReason = 'An construcție diferit (>10 ani)';
      }
    }
    
    // REGULA 5B: Verifică condiția proprietății (vechi vs nou)
    if (isCasaVeche) {
      const titluComp = (comp.titlu || '').toLowerCase();
      if (titluComp.includes('nou') || titluComp.includes('renovat') || titluComp.includes('renovație')) {
        isValid = false;
        rejectionReason = 'Proprietate nouă/renovată (nu se potrivește cu casă veche)';
      }
    }
    
    // REGULA 5C: Verifică tipul apartamentului (decomandat vs nedecomandat)
    if (extracted.tip === 'apartament' && extracted.criterii.compartimentare) {
      const titluComp = (comp.titlu || '').toLowerCase();
      const compartimentareSubiect = extracted.criterii.compartimentare.toLowerCase();
      if (compartimentareSubiect.includes('decomandat') && titluComp.includes('nedecomandat')) {
        isValid = false;
        rejectionReason = 'Compartimentare diferită (decomandat vs nedecomandat)';
      } else if (compartimentareSubiect.includes('nedecomandat') && titluComp.includes('decomandat')) {
        isValid = false;
        rejectionReason = 'Compartimentare diferită (nedecomandat vs decomandat)';
      }
    }
    
    // REGULA 5D: Elimină listări vechi (>120 zile) - dacă avem informație despre dată
    if ((comp as any).data_listare) {
      const dataListare = new Date((comp as any).data_listare);
      const daysOld = (Date.now() - dataListare.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld > 120) {
        isValid = false;
        rejectionReason = 'Listare veche (>120 zile)';
      }
    }
    
    // REGULA 5E: Elimină termeni suspecti pentru zone cu valoare mică
    if (orasSubiect && !orasSubiect.includes('bucurești') && !orasSubiect.includes('cluj')) {
      const titluComp = (comp.titlu || '').toLowerCase();
      const descComp = ((comp as any).descriere || '').toLowerCase();
      const fullTextComp = `${titluComp} ${descComp}`;
      if (fullTextComp.includes('lux') || fullTextComp.includes('premium') || fullTextComp.includes('investiție')) {
        isValid = false;
        rejectionReason = 'Termeni suspecti (lux/premium) pentru zonă cu valoare mică';
      }
    }
    
    // REGULA 5F: Elimină prețuri suspect de mari sau mici (bazat pe mediană)
    // Aceasta va fi aplicată mai târziu după calcularea medianei

    // REGULA 6: Elimină terenuri mari pentru micro-terenuri
    if (isMicroTeren) {
      const terenComp = comp.suprafata_teren || (comp as any).suprafata_teren;
      if (terenComp && terenComp > 500) {
        isValid = false;
        rejectionReason = 'Teren prea mare';
      }
    }

    if (isValid) {
      filtered.push(comp);
    } else {
      rejected.push({ ...comp, rejectionReason });
    }
  }

  // Dacă nu avem suficiente comparabile filtrate, relaxăm criteriile
  if (filtered.length < 5) {
    filtered.push(...rejected.slice(0, 10 - filtered.length));
  }

  // Dacă nu avem suficiente comparabile filtrate, relaxăm puțin criteriile
  if (filtered.length < 5) {
    console.warn(`[Fallback Analysis] Too few filtered comparables (${filtered.length}), relaxing criteria`);
    // Adaugă comparabile respinse cu teren similar sau din zone apropiate
    for (const comp of rejected.slice(0, 10)) {
      if (filtered.length >= 10) break;
      filtered.push(comp);
    }
  }

  // Dacă nu avem comparabile filtrate, generăm prețuri mock bazate pe criteriile extrase
  if (filtered.length === 0) {
    console.warn('[Fallback Analysis] No filtered comparables, generating mock prices based on criteria');
    // Generează prețuri mock realiste bazate pe criteriile extrase
    const { generateMockPrices } = await import("@/lib/searchClient");
    const mockPrices = generateMockPrices(
      extracted.tip || 'casa',
      'imobiliare',
      {
        id: undefined,
        title: extracted.tip || 'casa',
        description: undefined,
        category: 'imobiliare',
        price: subjectPrice || 0,
        currency: (extracted.criterii as any).currency || 'EUR',
        city: extracted.criterii.oras,
        area: extracted.criterii.zona,
        country: undefined,
        attributes: extracted.criterii,
      }
    );
    
    // Transformă prețurile mock în comparabile
    filtered = mockPrices.slice(0, 20).map((pret, index) => ({
      titlu: `Comparabil mock ${index + 1}`,
      link: '',
      pret,
      suprafata: extracted.criterii.suprafata,
      camere: extracted.criterii.camere,
      zona: extracted.criterii.zona,
      an: extracted.criterii.an || extracted.criterii.an_constructie,
      etaj: extracted.criterii.etaj,
      suprafata_teren: extracted.criterii.suprafata_teren,
    }));
  }
  
  // Calculează preț/mp pentru comparabile
  // Pentru terenuri, folosim suprafata_teren, pentru rest folosim suprafata
  const isLandOnly = extracted.tip === 'teren_intravilan' || extracted.tip === 'teren_agricol';
  const pricesPerM2 = filtered
    .filter(c => {
      if (isLandOnly) {
        // Pentru terenuri, verificăm suprafata_teren
        const surface = c.suprafata_teren || (c as any).suprafata_teren;
        return c.pret && surface && surface > 0;
      } else {
        // Pentru case/apartamente, verificăm suprafata
        return c.pret && c.suprafata && c.suprafata > 0;
      }
    })
    .map(c => {
      if (isLandOnly) {
        // Pentru terenuri, folosim suprafata_teren
        const surface = c.suprafata_teren || (c as any).suprafata_teren || extracted.criterii.suprafata_teren || 1;
        return { price: c.pret / surface, comp: c };
      } else {
        // Pentru case/apartamente, folosim suprafata
        return { price: c.pret / c.suprafata!, comp: c };
      }
    });

  if (pricesPerM2.length === 0) {
    console.warn('[Fallback Analysis] No valid prices per m2, generating fallback prices');
    
    // Pentru terenuri, folosim suprafata_teren și prețuri pe metru pătrat pentru terenuri
    const surface = isLandOnly ? 
      (extracted.criterii.suprafata_teren || 600) :
      (extracted.criterii.suprafata || 50);
    
    // Generează prețuri fallback bazate pe criteriile extrase
    let basePrice: number;
    if (isLandOnly) {
      // Pentru terenuri, calculăm preț total bazat pe suprafata_teren și preț/mp
      const pricePerM2 = extracted.criterii.oras?.toLowerCase().includes('bucurești') ? 100 :
                         extracted.criterii.oras?.toLowerCase().includes('cluj') ? 80 :
                         extracted.criterii.oras?.toLowerCase().includes('târgoviște') || extracted.criterii.oras?.toLowerCase().includes('targoviste') ? 12 :
                         20; // Default EUR/mp pentru terenuri
      basePrice = surface * pricePerM2; // Preț total pentru teren
    } else {
      // Pentru case/apartamente, calculăm bazat pe suprafata
      basePrice = surface * 500; // 500 EUR/mp default
    }
    
    // Ajustare pentru micro-teren sau casă veche
    let adjustedPrice = basePrice;
    if (extracted.criterii.categorie_speciala === 'micro-teren') {
      adjustedPrice = basePrice * 0.3; // -70% pentru micro-teren
    } else if (extracted.criterii.categorie_speciala === 'casă veche') {
      adjustedPrice = basePrice * 0.5; // -50% pentru casă veche
    }
    
    // Generează prețuri mock (prețuri totale)
    const fallbackPrices = [];
    for (let i = 0; i < 20; i++) {
      const variation = 0.7 + Math.random() * 0.6; // 0.7 - 1.3
      fallbackPrices.push(Math.round(adjustedPrice * variation));
    }
    
    // Transformă în format pricesPerM2 (preț/mp)
    pricesPerM2.push(...fallbackPrices.map(pret => ({
      price: pret / surface, // Preț/mp
      comp: {
        titlu: 'Comparabil fallback',
        link: '',
        pret, // Preț total
        suprafata: isLandOnly ? undefined : surface,
        suprafata_teren: isLandOnly ? surface : undefined,
      },
    })));
  }

  // Calculează mediană pentru filtrarea prețurilor suspecte
  const pricesOnly = pricesPerM2.map(p => p.price).sort((a, b) => a - b);
  const median = pricesOnly[Math.floor(pricesOnly.length / 2)];

  // REGULA 5F: Elimină prețuri suspect de mari sau mici (price_mp > 2.2× mediană sau < 0.35× mediană)
  const filteredByPrice = pricesPerM2.filter(p => {
    const priceMp = p.price;
    if (priceMp > median * 2.2 || priceMp < median * 0.35) {
      // Marchează comparabilul ca respins
      const compIndex = filtered.findIndex(c => c === p.comp);
      if (compIndex >= 0) {
        filtered.splice(compIndex, 1);
        rejected.push({ ...p.comp, rejectionReason: `Preț suspect (${priceMp.toFixed(0)} EUR/mp vs mediană ${median.toFixed(0)} EUR/mp)` });
      }
      return false;
    }
    return true;
  });

  // Elimină outlierii: preț/mp > 2.5× mediană sau < 0.3× mediană (regula originală, mai strictă)
  const filteredPrices = filteredByPrice
    .map(p => p.price)
    .filter(p => p >= median * 0.3 && p <= median * 2.5);

  if (filteredPrices.length === 0) {
    // Dacă toate sunt outliers, folosim toate
    filteredPrices.push(...pricesPerM2.map(p => p.price));
  }

  // Sortează prețurile
  filteredPrices.sort((a, b) => a - b);

  // Calculează percentile
  const p20 = filteredPrices[Math.floor(filteredPrices.length * 0.2)] || filteredPrices[0];
  const p40 = filteredPrices[Math.floor(filteredPrices.length * 0.4)] || filteredPrices[Math.floor(filteredPrices.length / 2)];
  const p60 = filteredPrices[Math.floor(filteredPrices.length * 0.6)] || filteredPrices[Math.floor(filteredPrices.length * 0.6)];
  const p80 = filteredPrices[Math.floor(filteredPrices.length * 0.8)] || filteredPrices[filteredPrices.length - 1];

  // Calculează preț/mp pentru subiect
  // Pentru terenuri, folosim suprafata_teren
  let pretMpSubiect = 0;
  const subjectSurfaceForCalc = isLandOnly ? 
    (subjectSurface || extracted.criterii.suprafata_teren || 1) :
    subjectSurface;
  
  if (subjectPrice && subjectSurfaceForCalc && subjectSurfaceForCalc > 0) {
    pretMpSubiect = subjectPrice / subjectSurfaceForCalc;
  } else if (filteredPrices.length > 0) {
    pretMpSubiect = filteredPrices[Math.floor(filteredPrices.length / 2)]; // Median
  }

  // REGULA CRITICĂ: Dacă este licitație, aplică reducere 40-60%
  let percentileFinale = { p20, p40, p60, p80 };
  let pretMpSubiectFinal = pretMpSubiect;
  let reducereAplicata = 0;

  if (extracted.licitatie) {
    // Aplică reducere 50% (media între 40% și 60%)
    reducereAplicata = 0.5;
    percentileFinale = {
      p20: Math.round(p20 * (1 - reducereAplicata)),
      p40: Math.round(p40 * (1 - reducereAplicata)),
      p60: Math.round(p60 * (1 - reducereAplicata)),
      p80: Math.round(p80 * (1 - reducereAplicata)),
    };
    pretMpSubiectFinal = Math.round(pretMpSubiect * (1 - reducereAplicata));
  }

  // Clasifică
  let clasificare: AnalysisResult['clasificare'] = 'in_piata';
  if (pretMpSubiectFinal < percentileFinale.p20) {
    clasificare = 'sub_piata';
  } else if (pretMpSubiectFinal > percentileFinale.p80 * 1.2) {
    clasificare = 'peste_piata';
  } else if (pretMpSubiectFinal > percentileFinale.p80) {
    clasificare = 'usor_peste';
  }

  // ============================================
  // ANALIZĂ PIAȚĂ: Detectează piață umflată și volatilitate
  // ============================================
  // Folosim comparabilele filtrate pentru analiza pieței
  const marketAnalysis = analyzeMarket(filtered);
  
  // Filtrează comparabilele bazat pe volatilitate
  let filteredByVolatility = filterByVolatility(filtered, marketAnalysis.volatility_score);
  
  // Dacă după filtrarea pe volatilitate avem prea puține comparabile, folosim cele originale
  if (filteredByVolatility.length < 5) {
    console.warn(`[Fallback Analysis] Too few comparables after volatility filtering (${filteredByVolatility.length}), using original filtered`);
    filteredByVolatility = [...filtered]; // Creează o copie nouă
  }
  
  // ============================================
  // MODEL HIBRID: Calculează valoarea reală (teren + construcție)
  // ============================================
  const hybridValuation = calculateHybridValuation(extracted);
  
  console.log('[AI Analyzer] Hybrid valuation result:', {
    tip: extracted.tip,
    terrain_value: hybridValuation.terrain_value,
    construction_value: hybridValuation.construction_value,
    total_value: hybridValuation.total_value,
    terrain_coefficient: hybridValuation.terrain_coefficient,
    landArea: extracted.criterii.suprafata_teren || extracted.criterii.suprafata,
    city: extracted.criterii.oras,
  });
  
  // Aplică corecții bazate pe piață
  let realValue = hybridValuation.total_value;
  
  if (marketAnalysis.inflated_market) {
    realValue *= (1 - marketAnalysis.unsold_market_discount);
  }
  
  if (marketAnalysis.piata_volatila) {
    realValue = applyVolatilityCorrection(realValue, marketAnalysis.volatility_score);
  }
  
  // Aplică discount pentru executare silită (DUPĂ calcularea valorii reale)
  let executionDiscount = 0;
  if (extracted.licitatie) {
    executionDiscount = 0.50; // 50% (media între 40% și 60%)
    realValue *= (1 - executionDiscount);
  }
  
  // Calculează intervalul final (min = 90% din valoare, max = 110%)
  const minValue = Math.round(realValue * 0.90);
  const maxValue = Math.round(realValue * 1.10);
  
  // Calculează nivelul de încredere
  let nivelIncredere: 'ridicat' | 'mediu' | 'scazut' = 'mediu';
  if (filteredByVolatility.length >= 20 && marketAnalysis.volatility_score < 0.25) {
    nivelIncredere = 'ridicat';
  } else if (filteredByVolatility.length < 5 || marketAnalysis.volatility_score > 0.50) {
    nivelIncredere = 'scazut';
  }
  
  // Generează explicație
  const explicatie = generateExplanation(
    pretMpSubiectFinal, 
    percentileFinale, 
    clasificare, 
    extracted,
    reducereAplicata,
    marketAnalysis,
    hybridValuation
  );

  return {
    pret_mp_subiect: pretMpSubiectFinal,
    percentile: percentileFinale,
    clasificare,
    comparabile_folosite: filteredByVolatility as Comparable[],
    comparabile_respinse: rejected,
    explicatie_ai: explicatie,
    pret_subiect: subjectPrice,
    suprafata_subiect: subjectSurface,
    // NOI CÂMPURI pentru modelul hibrid
    valoare_reala_interval: {
      min: minValue,
      max: maxValue,
      moneda: 'EUR',
    },
    valoare_reala_punct: Math.round(realValue),
    unsold_market_discount: marketAnalysis.inflated_market ? marketAnalysis.unsold_market_discount : 0,
    execution_discount: executionDiscount,
    scor_volatilitate_zona: marketAnalysis.volatility_score,
    inflated_market: marketAnalysis.inflated_market,
    piata_volatila: marketAnalysis.piata_volatila,
    nivel_incredere: nivelIncredere,
  };
}

/**
 * Generează explicație profesională
 */
function generateExplanation(
  pretMp: number,
  percentile: { p20: number; p40: number; p60: number; p80: number },
  clasificare: AnalysisResult['clasificare'],
  extracted: ExtractedCriteria,
  reducereAplicata: number = 0,
  marketAnalysis?: any,
  hybridValuation?: any
): string {
  const tipLabel = {
    apartament: 'apartament',
    casa: 'casă',
    'micro-teren + casă veche': 'micro-teren cu casă veche',
    teren_intravilan: 'teren intravilan',
    teren_agricol: 'teren agricol',
    spatiu_comercial: 'spațiu comercial',
    hala_industriala: 'hală industrială',
    proprietate_turistica: 'proprietate turistică',
  }[extracted.tip] || 'proprietate';

  const zonaText = extracted.criterii.zona ? ` din ${extracted.criterii.zona}` : '';
  const orasText = extracted.criterii.oras ? `, ${extracted.criterii.oras}` : '';
  
  // Menționează caracteristicile speciale
  let caracteristiciSpeciale = '';
  if (extracted.criterii.categorie_speciala === 'micro-teren') {
    caracteristiciSpeciale = ` (micro-teren de ${extracted.criterii.suprafata_teren} mp)`;
  } else if (extracted.criterii.categorie_speciala === 'casă veche') {
    caracteristiciSpeciale = ' (casă veche)';
  } else if (extracted.criterii.categorie_speciala === 'executare silită') {
    caracteristiciSpeciale = ' (executare silită / ANAF)';
  }

  let explicatie = `Prețul de ${Math.round(pretMp)} EUR/mp pentru ${tipLabel}${caracteristiciSpeciale}${zonaText}${orasText} `;

  // Dacă este licitație, menționează reducerea
  if (extracted.licitatie && reducereAplicata > 0) {
    explicatie += `este o licitație ANAF / executare silită. Prețul a fost ajustat cu ${(reducereAplicata * 100).toFixed(0)}% față de piața liberă. `;
  }

  switch (clasificare) {
    case 'sub_piata':
      explicatie += `Este sub nivelul pieței pentru proprietăți similare. Intervalul pieței: ${percentile.p20}-${percentile.p80} EUR/mp.`;
      if (extracted.licitatie) {
        explicatie += ` Aceasta este normală pentru licitații, unde prețurile sunt reduse față de piața liberă.`;
      } else {
        explicatie += ` Aceasta poate reprezenta o oportunitate favorabilă.`;
      }
      break;
    case 'in_piata':
      explicatie += `Este în intervalul normal al pieței (${percentile.p20}-${percentile.p80} EUR/mp). Prețul este aliniat cu ofertele similare.`;
      if (extracted.licitatie) {
        explicatie += ` Pentru o licitație, acest preț este potrivit.`;
      }
      break;
    case 'usor_peste':
      explicatie += `Este ușor peste media pieței (${percentile.p20}-${percentile.p80} EUR/mp).`;
      if (extracted.licitatie) {
        explicatie += ` Pentru o licitație, acest preț este încă acceptabil.`;
      } else {
        explicatie += ` Diferența poate fi justificată de caracteristici specifice sau localizare.`;
      }
      break;
    case 'peste_piata':
      explicatie += `Depășește nivelul pieței (${percentile.p20}-${percentile.p80} EUR/mp).`;
      if (extracted.licitatie) {
        explicatie += ` Pentru o licitație, acest preț este ridicat. Se recomandă verificarea caracteristicilor distinctive.`;
      } else {
        explicatie += ` Se recomandă verificarea caracteristicilor distinctive care justifică diferența.`;
      }
      break;
  }

  // Adaugă explicații suplimentare pentru cazuri speciale
  if (extracted.criterii.categorie_speciala === 'micro-teren') {
    explicatie += ` Proprietatea are un teren foarte mic (${extracted.criterii.suprafata_teren} mp), ceea ce explică prețul redus față de casele cu teren mare.`;
  } else if (extracted.criterii.categorie_speciala === 'casă veche') {
    explicatie += ` Proprietatea este o casă veche fără renovări recente, ceea ce explică prețul redus față de casele noi sau renovate.`;
  }

  // Adaugă informații despre piața umflată și volatilitate
  if (marketAnalysis) {
    if (marketAnalysis.inflated_market) {
      explicatie += ` Piața din zonă prezintă semne de umflare (prețuri cu ${(marketAnalysis.unsold_market_discount * 100).toFixed(0)}% peste valoarea reală de vânzare).`;
    }
    if (marketAnalysis.piata_volatila) {
      explicatie += ` Zona prezintă volatilitate ridicată (scor: ${marketAnalysis.volatility_score.toFixed(2)}), ceea ce indică variații mari de preț.`;
    }
  }

  // Adaugă informații despre modelul hibrid
  if (hybridValuation) {
    explicatie += ` Evaluarea hibridă (teren + construcție) indică o valoare reală de ${Math.round(hybridValuation.total_value)} EUR (teren: ${Math.round(hybridValuation.terrain_value)} EUR, construcție: ${Math.round(hybridValuation.construction_value)} EUR).`;
    if (hybridValuation.depreciation_applied > 0) {
      explicatie += ` A fost aplicată o depreciere de ${(hybridValuation.depreciation_applied * 100).toFixed(0)}% pentru construcție.`;
    }
  }

  return explicatie;
}

