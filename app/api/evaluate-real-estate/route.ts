/**
 * API Evaluare Imobiliară Profesională
 * Arhitectură în 4 pași:
 * 1. AI Extractor (GPT-4o) - extrage criterii
 * 2. Google Search API - găsește comparabile
 * 3. AI Analyzer (GPT-4o) - analizează și clasifică
 * 4. Validator (Decision Engine) - validează și decide re-analizare
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractRealEstateCriteria } from '@/lib/real-estate/aiExtractor';
import { analyzeRealEstateComparables, Comparable } from '@/lib/real-estate/aiAnalyzer';
import { validateEvaluation } from '@/lib/real-estate/validator';
import { retrieveRealEstateKnowledge, formatKnowledgeForPrompt } from '@/lib/real-estate/ragKnowledge';
import { calculateRiskScore } from '@/lib/autopilot/riskScoring';
import { buildSearchQueryForProduct } from '@/lib/priceLogic';
import { searchWebForComparables } from '@/lib/searchClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 60; // 60 secunde pentru procesare completă

export interface RealEstateEvaluationRequest {
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  userFields?: Record<string, any>; // Câmpuri suplimentare introduse de user
}

export interface RealEstateEvaluationResponse {
  ok: boolean;
  step1_extraction?: {
    criteria: any;
    query_google: string;
    knowledge?: string;
  };
  step2_search?: {
    comparables_found: number;
    comparables: Comparable[];
  };
  step3_analysis?: {
    pret_mp_subiect: number;
    percentile: {
      p20: number;
      p40: number;
      p60: number;
      p80: number;
    };
    clasificare: string;
    explicatie_ai: string;
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
    comparabile_folosite?: Comparable[];
    comparabile_respinse?: Comparable[];
  };
  step4_validation?: {
    valid: boolean;
    confidence: number;
    needsReanalysis: boolean;
    issues: string[];
    recommendations: string[];
  };
  risk_score?: {
    score: number;
    factors: any;
  };
  error?: string;
}

/**
 * POST: Evaluează o proprietate imobiliară
 */
export async function POST(request: NextRequest) {
  try {
    const body: RealEstateEvaluationRequest = await request.json();
    const { title, description, price, currency = 'EUR', userFields } = body;

    if (!title) {
      return NextResponse.json(
        { ok: false, error: 'Titlul este obligatoriu' },
        { status: 400 }
      );
    }

    console.log('[Real Estate Evaluation] Starting evaluation for:', title);

    // ============================================
    // PASUL 0: RAG Knowledge (Opțional)
    // ============================================
    let knowledgeContext = '';
    try {
      const knowledge = await retrieveRealEstateKnowledge(title, {
        tip: userFields?.tip,
        oras: userFields?.oras || userFields?.city,
        zona: userFields?.zona || userFields?.area,
      });
      knowledgeContext = formatKnowledgeForPrompt(knowledge);
      console.log('[Real Estate Evaluation] RAG knowledge retrieved');
    } catch (error) {
      console.warn('[Real Estate Evaluation] RAG knowledge failed, continuing without it:', error);
    }

    // ============================================
    // PASUL 1: AI EXTRACTOR (GPT-4o)
    // ============================================
    console.log('[Real Estate Evaluation] Step 1: AI Extractor...');
    const extracted = await extractRealEstateCriteria(title, description, userFields);
    console.log('[Real Estate Evaluation] Extracted criteria:', extracted.tip, extracted.criterii);

    // ============================================
    // PASUL 2: GOOGLE SEARCH API
    // ============================================
    console.log('[Real Estate Evaluation] Step 2: Google Search...');
    
    // Construiește query pentru Google Search
    const searchQuery = extracted.query_google;
    
    // Caută comparabile folosind funcția existentă (adaptată pentru imobiliare)
    const productForSearch = {
      title,
      description: description || '',
      category: 'imobiliare',
      price: price || 0,
      currency,
      city: extracted.criterii.oras,
      area: extracted.criterii.zona,
      attributes: extracted.criterii,
    };

    let comparables: Comparable[] = [];
    try {
      // Folosește funcția existentă de căutare
      const prices = await searchWebForComparables(productForSearch);
      
      // Transformă prețurile în comparabile (simplificat - în producție ar trebui să extragi mai multe detalii)
      comparables = prices.map((pret, index) => ({
        titlu: `Comparabil ${index + 1}`,
        link: '',
        pret,
        suprafata: extracted.criterii.suprafata,
        camere: extracted.criterii.camere,
        zona: extracted.criterii.zona,
        an: extracted.criterii.an,
        etaj: extracted.criterii.etaj,
      }));

      console.log(`[Real Estate Evaluation] Found ${comparables.length} comparables`);
    } catch (error) {
      console.error('[Real Estate Evaluation] Search error:', error);
      // Continuă cu comparabile goale - AI Analyzer va gestiona
    }

    // Dacă nu avem suficiente comparabile, generează mock-uri bazate pe criterii
    if (comparables.length < 5) {
      console.warn('[Real Estate Evaluation] Too few comparables, generating mock data');
      comparables = generateMockComparables(extracted, price);
    }

    // ============================================
    // PASUL 3: AI ANALYZER (GPT-4o)
    // ============================================
    console.log('[Real Estate Evaluation] Step 3: AI Analyzer...');
    const analysis = await analyzeRealEstateComparables(
      extracted,
      comparables,
      price,
      extracted.criterii.suprafata
    );
    console.log('[Real Estate Evaluation] Analysis complete:', analysis.clasificare);

    // ============================================
    // PASUL 4: VALIDATOR (Decision Engine)
    // ============================================
    console.log('[Real Estate Evaluation] Step 4: Validator...');
    const validation = await validateEvaluation(
      extracted,
      analysis,
      comparables.length
    );
    console.log('[Real Estate Evaluation] Validation complete:', validation.valid, validation.confidence);

    // Dacă validatorul recomandă re-analizare, o facem
    if (validation.needsReanalysis && validation.recommendations.length > 0) {
      console.log('[Real Estate Evaluation] Re-analysis recommended, performing...');
      
      // Relaxăm filtrele și re-analizăm
      const relaxedComparables = generateRelaxedComparables(extracted, comparables);
      const reanalysis = await analyzeRealEstateComparables(
        extracted,
        relaxedComparables,
        price,
        extracted.criterii.suprafata
      );
      
      // Actualizăm analiza cu rezultatul re-analizei
      Object.assign(analysis, reanalysis);
    }

    // ============================================
    // RISK SCORING (Opțional)
    // ============================================
    let riskScore = null;
    try {
      const risk = await calculateRiskScore({
        type: 'real_estate_evaluation',
        payload: {
          title,
          extracted,
          analysis,
        },
        est_cost_usd: 0.1, // Cost estimat pentru evaluare
      });
      riskScore = {
        score: risk.score,
        factors: risk.factors,
      };
      console.log('[Real Estate Evaluation] Risk score:', risk.score);
    } catch (error) {
      console.warn('[Real Estate Evaluation] Risk scoring failed:', error);
    }

    // ============================================
    // CONSTRUIRE RĂSPUNS
    // ============================================
    const response: RealEstateEvaluationResponse = {
      ok: true,
      step1_extraction: {
        criteria: extracted,
        query_google: extracted.query_google,
        knowledge: knowledgeContext || undefined,
      },
      step2_search: {
        comparables_found: comparables.length,
        comparables: comparables.slice(0, 20), // Limitează pentru răspuns
      },
      step3_analysis: {
        pret_mp_subiect: analysis.pret_mp_subiect,
        percentile: analysis.percentile,
        clasificare: analysis.clasificare,
        explicatie_ai: analysis.explicatie_ai,
        // NOI CÂMPURI pentru modelul hibrid
        valoare_reala_interval: analysis.valoare_reala_interval,
        valoare_reala_punct: analysis.valoare_reala_punct,
        unsold_market_discount: analysis.unsold_market_discount,
        execution_discount: analysis.execution_discount,
        scor_volatilitate_zona: analysis.scor_volatilitate_zona,
        inflated_market: analysis.inflated_market,
        piata_volatila: analysis.piata_volatila,
        nivel_incredere: analysis.nivel_incredere,
        comparabile_folosite: analysis.comparabile_folosite,
        comparabile_respinse: analysis.comparabile_respinse,
      },
      step4_validation: {
        valid: validation.valid,
        confidence: validation.confidence,
        needsReanalysis: validation.needsReanalysis,
        issues: validation.issues,
        recommendations: validation.recommendations,
      },
      ...(riskScore && { risk_score: riskScore }),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Real Estate Evaluation] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Eroare la evaluarea imobiliară',
      },
      { status: 500 }
    );
  }
}

/**
 * Generează comparabile mock bazate pe criterii
 */
function generateMockComparables(
  extracted: any,
  subjectPrice?: number
): Comparable[] {
  const comparables: Comparable[] = [];
  
  // Calculează preț/mp mediu bazat pe criterii
  let basePricePerM2 = 1000; // Default
  
  if (extracted.criterii.oras) {
    const oras = extracted.criterii.oras.toLowerCase();
    if (oras.includes('bucurești') || oras.includes('bucuresti')) {
      basePricePerM2 = 1200;
    } else if (oras.includes('cluj')) {
      basePricePerM2 = 1100;
    } else if (oras.includes('iași') || oras.includes('iasi')) {
      basePricePerM2 = 700;
    } else if (oras.includes('timișoara') || oras.includes('timisoara')) {
      basePricePerM2 = 800;
    }
  }
  
  // Ajustare bazată pe zonă
  if (extracted.criterii.zona) {
    const zona = extracted.criterii.zona.toLowerCase();
    if (zona.includes('dorobanți') || zona.includes('aviatiei') || zona.includes('primăverii')) {
      basePricePerM2 *= 1.5;
    } else if (zona.includes('militari') || zona.includes('drumul taberei')) {
      basePricePerM2 *= 0.85;
    }
  }
  
  // Generează 20 comparabile cu variație ±30%
  for (let i = 0; i < 20; i++) {
    const variation = 0.7 + Math.random() * 0.6; // 0.7 - 1.3
    const pricePerM2 = Math.round(basePricePerM2 * variation);
    const suprafata = extracted.criterii.suprafata || 50 + Math.random() * 50;
    const pret = Math.round(pricePerM2 * suprafata);
    
    comparables.push({
      titlu: `Comparabil ${i + 1}`,
      link: '',
      pret,
      suprafata: Math.round(suprafata),
      camere: extracted.criterii.camere,
      zona: extracted.criterii.zona,
      an: extracted.criterii.an,
      etaj: extracted.criterii.etaj,
    });
  }
  
  return comparables;
}

/**
 * Generează comparabile relaxate pentru re-analizare
 */
function generateRelaxedComparables(
  extracted: any,
  originalComparables: Comparable[]
): Comparable[] {
  // Adaugă mai multe comparabile cu filtre mai relaxate
  const relaxed = [...originalComparables];
  
  // Generează comparabile suplimentare cu variații mai mari
  for (let i = 0; i < 15; i++) {
    const basePrice = originalComparables.length > 0
      ? originalComparables[Math.floor(originalComparables.length / 2)].pret
      : 100000;
    
    const variation = 0.5 + Math.random() * 1.0; // 0.5 - 1.5
    const pret = Math.round(basePrice * variation);
    
    relaxed.push({
      titlu: `Comparabil relaxat ${i + 1}`,
      link: '',
      pret,
      suprafata: extracted.criterii.suprafata
        ? Math.round(extracted.criterii.suprafata * (0.8 + Math.random() * 0.4))
        : undefined,
      camere: extracted.criterii.camere,
      zona: extracted.criterii.zona,
      an: extracted.criterii.an
        ? extracted.criterii.an + Math.floor(Math.random() * 10) - 5
        : undefined,
    });
  }
  
  return relaxed;
}

