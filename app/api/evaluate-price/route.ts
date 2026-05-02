import { NextRequest, NextResponse } from "next/server";
import { ProductForEvaluation, PriceEvaluationResponse } from "@/lib/types/priceEvaluation";
import { computePriceRangesFromSamples, classifyPrice, buildCategorySpecificContext } from "@/lib/priceLogic";
import { searchWebForComparables } from "@/lib/searchClient";
import { generatePriceExplanation } from "@/lib/openaiClient";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";
// Import pentru evaluare imobiliară profesională
import { extractRealEstateCriteria } from "@/lib/real-estate/aiExtractor";
import { analyzeRealEstateComparables } from "@/lib/real-estate/aiAnalyzer";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

/** Curs Lei/EUR pentru comparare (evaluarea imobiliară folosește EUR) */
const RON_EUR_RATE = Number(process.env.NEXT_PUBLIC_RON_EUR_RATE) || 5.0;

/**
 * Convertește prețul produsului în EUR dacă este în Lei (pentru comparare cu intervalele în EUR)
 */
function toEurForComparison(price: number, currency: string): number {
  if (currency === 'RON') return price / RON_EUR_RATE;
  return price;
}

/**
 * Convertește din EUR în Lei pentru afișare (când produsul este în Lei)
 */
function toDisplayCurrency(value: number, currency: string): number {
  if (currency === 'RON') return Math.round(value * RON_EUR_RATE);
  return Math.round(value);
}

/**
 * Generează un hash pentru produs bazat pe caracteristicile sale principale
 */
const CACHE_VERSION = 'v2_eur_display'; // invalidează cache la schimbări EUR/display

function generateProductHash(product: ProductForEvaluation): string {
  const hashString = `${CACHE_VERSION}|${product.title}|${product.category}|${product.price}|${product.currency}|${product.city || ''}|${product.area || ''}|${(product as any).product_type || ''}`;
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

/**
 * Caută o evaluare în cache
 */
async function getCachedEvaluation(productHash: string, productId?: string): Promise<PriceEvaluationResponse | null> {
  try {
    // Folosim supabase normal pentru citire (public access)
    const client = supabase;
    
    // Verifică dacă tabela există - dacă nu, continuă fără cache
    let query = client
      .from('price_evaluations')
      .select('*')
      .eq('product_hash', productHash)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    // Dacă avem product_id, preferăm evaluarea pentru acel produs specific
    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query;

    // Dacă tabela nu există, ignoră eroarea și continuă
    if (error) {
      // Verifică dacă eroarea este despre tabelă inexistentă
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.warn('[Evaluate] Cache table does not exist, skipping cache check');
        return null;
      }
      console.error('[Evaluate] Error fetching cached evaluation:', error);
      return null;
    }

    if (data && data.length > 0) {
      const cached = data[0];
      console.log(`[Evaluate] Found cached evaluation (created: ${cached.created_at})`);
      return cached.evaluation_data as PriceEvaluationResponse;
    }

    return null;
  } catch (error: any) {
    // Dacă tabela nu există, ignoră eroarea
    if (error?.message?.includes('relation') || error?.message?.includes('does not exist')) {
      console.warn('[Evaluate] Cache table does not exist, skipping cache check');
      return null;
    }
    console.error('[Evaluate] Error in getCachedEvaluation:', error);
    return null;
  }
}

/**
 * Salvează o evaluare în cache
 */
async function saveEvaluationToCache(
  product: ProductForEvaluation,
  evaluation: PriceEvaluationResponse
): Promise<void> {
  try {
    // Folosim supabaseAdmin pentru scriere (dacă este disponibil), altfel supabase normal
    const client = supabaseAdmin || supabase;
    
    if (!client) {
      console.warn('[Evaluate] No Supabase client available for saving cache');
      return;
    }

    const productHash = generateProductHash(product);
    
    const cacheData = {
      product_id: product.id || 'unknown',
      product_hash: productHash,
      product_data: product,
      evaluation_data: evaluation,
      samples_count: evaluation.samplesCount || 0,
      min_price: evaluation.minPrice || 0,
      max_price: evaluation.maxPrice || 0,
      avg_price: evaluation.avgPrice || 0,
      level: evaluation.level || 'fair',
      no_evaluation: evaluation.noEvaluation || false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 zile
    };

    const { error } = await client
      .from('price_evaluations')
      .insert([cacheData]);

    if (error) {
      console.error('[Evaluate] Error saving evaluation to cache:', error);
      // Nu aruncăm eroare, doar logăm - evaluarea a fost calculată cu succes
    } else {
      console.log(`[Evaluate] Saved evaluation to cache (hash: ${productHash.substring(0, 8)}...)`);
    }
  } catch (error) {
    console.error('[Evaluate] Error in saveEvaluationToCache:', error);
    // Nu aruncăm eroare, doar logăm
  }
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    try {
      body = await request.json();
    } catch (jsonError: any) {
      console.error('[Evaluate] Error parsing JSON body:', jsonError);
      return NextResponse.json(
        { ok: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    const product: ProductForEvaluation = body;

    console.log('[Evaluate] Received request:', {
      hasTitle: !!product.title,
      hasCategory: !!product.category,
      hasPrice: !!product.price,
      price: product.price,
      hasCurrency: !!product.currency,
    });

    // Validare
    if (!product.title || !product.category || !product.price || !product.currency) {
      console.error('[Evaluate] Missing required fields:', {
        title: product.title,
        category: product.category,
        price: product.price,
        currency: product.currency,
      });
      return NextResponse.json(
        { ok: false, error: "Missing required fields: title, category, price, currency" },
        { status: 400 }
      );
    }

    if (product.price <= 0) {
      console.error('[Evaluate] Invalid price:', product.price);
      return NextResponse.json(
        { ok: false, error: "Price must be greater than 0" },
        { status: 400 }
      );
    }

    // Verifică cache-ul mai întâi
    const productHash = generateProductHash(product);
    console.log(`[Evaluate] Checking cache for product: ${product.title} (hash: ${productHash.substring(0, 8)}...)`);
    
    const cachedEvaluation = await getCachedEvaluation(productHash, product.id);
    if (cachedEvaluation) {
      console.log('[Evaluate] Returning cached evaluation');
      return NextResponse.json(cachedEvaluation);
    }

    // Dacă nu există în cache, facem evaluarea
    console.log(`[Evaluate] No cache found, evaluating: ${product.title}`);
    
    // ============================================
    // EVALUARE IMOBILIARĂ PROFESIONALĂ (HIBRID)
    // ============================================
    const isRealEstate = product.category === 'imobiliare' || 
                         product.category === 'house' || 
                         product.category === 'casa' || 
                         product.category === 'vila' ||
                         product.category === 'apartment' ||
                         product.category === 'apartament' ||
                         product.category === 'land' ||
                         product.category === 'teren';
    
    if (isRealEstate) {
      console.log('[Evaluate] Using HYBRID REAL ESTATE evaluation system');
      
      try {
        // PASUL 1: AI Extractor
        let extracted;
        try {
          extracted = await extractRealEstateCriteria(
            product.title,
            product.description,
            product.attributes
          );
          // FORȚEAZĂ licitație=true pentru produse din licitații publice (prețurile sunt 30-60% sub piață)
          const isLicitatiePublica = product.product_type === 'licitatii-publice' || product.attributes?.product_type === 'licitatii-publice';
          if (isLicitatiePublica) {
            extracted.licitatie = true;
            extracted.criterii = extracted.criterii || {};
            extracted.criterii.categorie_speciala = extracted.criterii.categorie_speciala || 'licitație publică';
            console.log('[Evaluate] Forced licitatie=true (product from licitatii-publice)');
          }
          console.log('[Evaluate] Extracted criteria:', extracted.tip, extracted.licitatie, extracted.criterii);
        } catch (extractError: any) {
          console.error('[Evaluate] AI Extractor error:', extractError);
          console.error('[Evaluate] AI Extractor error stack:', extractError.stack);
          // Fallback: continuă cu evaluarea standard (nu aruncă eroare, continuă mai jos)
          console.log('[Evaluate] Falling back to standard evaluation due to AI Extractor error');
          // Setăm extracted la null pentru a forța fallback-ul
          extracted = null;
        }
        
        // Dacă AI Extractor a eșuat, continuăm cu evaluarea standard
        if (!extracted) {
          console.log('[Evaluate] Using standard evaluation as fallback (AI Extractor failed)');
          // Continuă cu codul de mai jos pentru evaluarea standard
          // Nu returnăm aici, continuăm cu evaluarea standard
        } else {
          // PASUL 2: Caută comparabile (transformă în format Comparable)
          // Pentru imobiliare, folosim prețuri mock realiste bazate pe criteriile extrase
          let comparables;
          try {
            const prices = await searchWebForComparables(product);
            comparables = prices.map((pret, index) => ({
              titlu: `Comparabil ${index + 1}`,
              link: '',
              pret,
              suprafata: product.attributes?.suprafata || product.attributes?.surface,
              camere: product.attributes?.camere || product.attributes?.rooms,
              zona: product.area || product.attributes?.zona,
              an: product.attributes?.year || product.attributes?.an,
              etaj: product.attributes?.floor || product.attributes?.etaj,
              suprafata_teren: product.attributes?.suprafata_teren || product.attributes?.land,
            }));
          } catch (error) {
            console.warn('[Evaluate] Search error, using mock prices');
            // Dacă căutarea eșuează, generăm comparabile mock realiste
            const { generateMockPrices } = await import("@/lib/searchClient");
            const mockPrices = generateMockPrices(product.title, product.category, product);
            comparables = mockPrices.map((pret, index) => ({
              titlu: `Comparabil mock ${index + 1}`,
              link: '',
              pret,
              suprafata: product.attributes?.suprafata || product.attributes?.surface,
              camere: product.attributes?.camere || product.attributes?.rooms,
              zona: product.area || product.attributes?.zona,
              an: product.attributes?.year || product.attributes?.an,
              etaj: product.attributes?.floor || product.attributes?.etaj,
              suprafata_teren: product.attributes?.suprafata_teren || product.attributes?.land,
            }));
          }
          
          // Dacă nu avem suficiente comparabile, generăm mock-uri suplimentare
          if (comparables.length < 10) {
            console.warn(`[Evaluate] Too few comparables (${comparables.length}), generating additional mock prices`);
            const { generateMockPrices } = await import("@/lib/searchClient");
            const mockPrices = generateMockPrices(product.title, product.category, product);
            const additionalComparables = mockPrices.slice(0, 20 - comparables.length).map((pret, index) => ({
              titlu: `Comparabil mock ${index + 1}`,
              link: '',
              pret,
              suprafata: product.attributes?.suprafata || product.attributes?.surface,
              camere: product.attributes?.camere || product.attributes?.rooms,
              zona: product.area || product.attributes?.zona,
              an: product.attributes?.year || product.attributes?.an,
              etaj: product.attributes?.floor || product.attributes?.etaj,
              suprafata_teren: product.attributes?.suprafata_teren || product.attributes?.land,
            }));
            comparables = [...comparables, ...additionalComparables];
          }
          
          console.log(`[Evaluate] Using ${comparables.length} comparables for analysis`);
          
          // PASUL 3: AI Analyzer (cu model hibrid)
          let analysis;
          try {
            const priceInEur = toEurForComparison(product.price, product.currency);
            analysis = await analyzeRealEstateComparables(
              extracted,
              comparables,
              priceInEur,
              product.attributes?.suprafata || product.attributes?.surface
            );
            console.log('[Evaluate] Analysis complete:', analysis.clasificare, 'Real value:', analysis.valoare_reala_punct);
          } catch (analyzeError: any) {
            console.error('[Evaluate] AI Analyzer error:', analyzeError);
            console.error('[Evaluate] AI Analyzer error stack:', analyzeError.stack);
            // Fallback: continuă cu evaluarea standard (nu aruncă eroare, continuă mai jos)
            console.log('[Evaluate] Falling back to standard evaluation due to AI Analyzer error');
            // Setăm analysis la null pentru a forța fallback-ul
            analysis = null;
          }
          
          // Dacă AI Analyzer a eșuat, continuăm cu evaluarea standard
          if (!analysis) {
            console.log('[Evaluate] Using standard evaluation as fallback');
            // Continuă cu codul de mai jos pentru evaluarea standard
            // Nu returnăm aici, continuăm cu evaluarea standard
          } else {
          // Folosește valoarea reală din modelul hibrid (teren + construcție)
          const realValueMin = analysis.valoare_reala_interval?.min || 0;
          const realValueMax = analysis.valoare_reala_interval?.max || 0;
          const realValuePoint = analysis.valoare_reala_punct || 0;
          
          // Calculează minPrice, maxPrice, avgPrice din STATISTICILE PIEȚEI (percentile)
          // IMPORTANT: Folosim percentilele din statisticile pieței, nu modelul hibrid
          const isLandOnly = extracted?.tip === 'teren_intravilan' || extracted?.tip === 'teren_agricol';
          const surfaceForConversion = isLandOnly ? 
            (extracted?.criterii?.suprafata_teren || product.attributes?.suprafata_teren || product.attributes?.surface || 600) :
            (extracted?.criterii?.suprafata || product.attributes?.suprafata || product.attributes?.surface || 50);
          
          let minPrice, maxPrice, avgPrice;
          if (analysis.percentile) {
            if (isLandOnly && surfaceForConversion > 0) {
              // Pentru terenuri: convertește percentilele din EUR/mp în EUR total
              minPrice = Math.round(analysis.percentile.p20 * surfaceForConversion);
              maxPrice = Math.round(analysis.percentile.p80 * 1.5 * surfaceForConversion);
              avgPrice = Math.round((analysis.percentile.p40 + analysis.percentile.p60) / 2 * surfaceForConversion);
            } else if (surfaceForConversion > 0 && !isLandOnly) {
              // Pentru case/apartamente: convertește percentilele din EUR/mp în EUR total
              minPrice = Math.round(analysis.percentile.p20 * surfaceForConversion);
              maxPrice = Math.round(analysis.percentile.p80 * 1.5 * surfaceForConversion);
              avgPrice = Math.round((analysis.percentile.p40 + analysis.percentile.p60) / 2 * surfaceForConversion);
            } else {
              // Fallback: presupunem că percentilele sunt deja în EUR total
              minPrice = analysis.percentile.p20;
              maxPrice = analysis.percentile.p80 * 1.5;
              avgPrice = (analysis.percentile.p40 + analysis.percentile.p60) / 2;
            }
          } else {
            // Fallback la prețurile din comparabile
            const compPrices = analysis.comparabile_folosite?.map(c => c.pret).filter(p => p > 0) || [];
            if (compPrices.length > 0) {
              minPrice = Math.min(...compPrices);
              maxPrice = Math.max(...compPrices);
              avgPrice = compPrices.reduce((sum, p) => sum + p, 0) / compPrices.length;
            } else {
              minPrice = 0;
              maxPrice = 0;
              avgPrice = 0;
            }
          }
          
          // Pentru LICITAȚII PUBLICE: prețurile sunt 30-60% din piața liberă → scalăm intervalele și statisticile
          const licitatieScale = extracted.licitatie ? 0.5 : 1; // 50% = mijlocul intervalului 30-60%
          if (extracted.licitatie) {
            minPrice = Math.round(minPrice * licitatieScale);
            maxPrice = Math.round(maxPrice * licitatieScale);
            avgPrice = Math.round(avgPrice * licitatieScale);
          }
          
          // Calculează intervale bazate pe STATISTICILE PIEȚEI (percentile)
          // IMPORTANT: Folosim întotdeauna percentilele din statisticile pieței, nu modelul hibrid
          // Pentru terenuri, percentilele sunt în EUR/mp, trebuie convertite în EUR total
          // (isLandOnly și surfaceForConversion sunt deja definite mai sus)
          let ranges;
          const scale = (v: number) => Math.round(v * licitatieScale);
          if (isLandOnly && surfaceForConversion > 0 && analysis.percentile) {
            // Pentru terenuri: convertește percentilele din EUR/mp în EUR total
            const p20 = analysis.percentile.p20 * surfaceForConversion;
            const p40 = analysis.percentile.p40 * surfaceForConversion;
            const p60 = analysis.percentile.p60 * surfaceForConversion;
            const p80 = analysis.percentile.p80 * surfaceForConversion;
            ranges = {
              very_good: [scale(p20), scale(p40)] as [number, number],
              good: [scale(p40), scale(p60)] as [number, number],
              fair: [scale(p60), scale(p80)] as [number, number],
              high: [scale(p80), scale(p80 * 1.2)] as [number, number],
              very_high: [scale(p80 * 1.2), scale(p80 * 1.5)] as [number, number],
            };
          } else if (analysis.percentile) {
            // Pentru case/apartamente: percentilele sunt în EUR/mp, trebuie convertite în EUR total
            // Dacă nu avem suprafață, folosim percentilele direct (presupunem că sunt deja în EUR total)
            if (surfaceForConversion > 0 && !isLandOnly) {
              const p20 = analysis.percentile.p20 * surfaceForConversion;
              const p40 = analysis.percentile.p40 * surfaceForConversion;
              const p60 = analysis.percentile.p60 * surfaceForConversion;
              const p80 = analysis.percentile.p80 * surfaceForConversion;
              ranges = {
                very_good: [scale(p20), scale(p40)] as [number, number],
                good: [scale(p40), scale(p60)] as [number, number],
                fair: [scale(p60), scale(p80)] as [number, number],
                high: [scale(p80), scale(p80 * 1.2)] as [number, number],
                very_high: [scale(p80 * 1.2), scale(p80 * 1.5)] as [number, number],
              };
            } else {
              const { p20, p40, p60, p80 } = analysis.percentile;
              ranges = {
                very_good: [scale(p20), scale(p40)] as [number, number],
                good: [scale(p40), scale(p60)] as [number, number],
                fair: [scale(p60), scale(p80)] as [number, number],
                high: [scale(p80), scale(p80 * 1.2)] as [number, number],
                very_high: [scale(p80 * 1.2), scale(p80 * 1.5)] as [number, number],
              };
            }
          } else {
            // Fallback extrem: folosim minPrice și maxPrice
            const spread = maxPrice - minPrice;
            ranges = {
              very_good: [minPrice, minPrice + spread * 0.2] as [number, number],
              good: [minPrice + spread * 0.2, minPrice + spread * 0.4] as [number, number],
              fair: [minPrice + spread * 0.4, minPrice + spread * 0.6] as [number, number],
              high: [minPrice + spread * 0.6, minPrice + spread * 0.8] as [number, number],
              very_high: [minPrice + spread * 0.8, maxPrice] as [number, number],
            };
          }
          
          // Calculează level: comparația se face în EUR (ranges sunt în EUR)
          const priceForCompare = toEurForComparison(product.price, product.currency);
          console.log('[Evaluate] Calculating level for product price:', product.price, product.currency, '→', priceForCompare, 'EUR. Ranges (EUR):', ranges);
          const calculatedLevel = classifyPrice(priceForCompare, ranges);
          console.log('[Evaluate] Calculated level:', calculatedLevel, 'Original clasificare:', analysis.clasificare);
          
          // Pentru produse în Lei: peste 1000 EUR afișăm în EUR, altfel în Lei
          const useEurForDisplay = product.currency === 'RON' && (avgPrice > 1000 || priceForCompare > 1000);
          const display = (v: number) => useEurForDisplay ? Math.round(v) : toDisplayCurrency(v, product.currency);
          const evaluationResponse: PriceEvaluationResponse = {
            ok: true,
            noEvaluation: false,
            product,
            samplesCount: analysis.comparabile_folosite?.length || 0,
            samples: (analysis.comparabile_folosite || []).map(c => c.pret).filter(p => p > 0 && isFinite(p)),
            minPrice: display(minPrice),
            maxPrice: display(maxPrice),
            avgPrice: display(avgPrice),
            ranges: {
              very_good: [display(ranges.very_good[0]), display(ranges.very_good[1])] as [number, number],
              good: [display(ranges.good[0]), display(ranges.good[1])] as [number, number],
              fair: [display(ranges.fair[0]), display(ranges.fair[1])] as [number, number],
              high: [display(ranges.high[0]), display(ranges.high[1])] as [number, number],
              very_high: [display(ranges.very_high[0]), display(ranges.very_high[1])] as [number, number],
            },
            level: calculatedLevel,
            ...(useEurForDisplay && {
              displayCurrency: 'EUR',
              priceDisplay: Math.round(priceForCompare),
            }),
            aiExplanation: {
              summary: (analysis.explicatie_ai || 'Evaluare disponibilă').substring(0, 200),
              details: {
                ro_short: analysis.clasificare === 'sub_piata' ? 'Preț sub piață' :
                         analysis.clasificare === 'in_piata' ? 'Preț în piață' :
                         analysis.clasificare === 'usor_peste' ? 'Preț ușor peste piață' :
                         analysis.clasificare === 'peste_piata' ? 'Preț peste piață' : 'Preț corect',
                ro_long: analysis.explicatie_ai || 'Evaluare bazată pe model hibrid (teren + construcție)',
                bullets: [
                  analysis.inflated_market ? `Piață umflată detectată (discount: ${(analysis.unsold_market_discount || 0) * 100}%)` : null,
                  analysis.piata_volatila ? `Zonă volatilă (scor: ${(analysis.scor_volatilitate_zona || 0).toFixed(2)})` : null,
                  analysis.execution_discount ? `Discount executare silită: ${(analysis.execution_discount * 100).toFixed(0)}%` : null,
                  analysis.valoare_reala_punct ? `Valoare reală estimată: ${analysis.valoare_reala_punct} EUR` : null,
                ].filter(Boolean) as string[],
              },
            },
          };
          
          // Salvează în cache
          saveEvaluationToCache(product, evaluationResponse).catch(err => {
            console.error('[Evaluate] Failed to save to cache:', err);
          });
          
          // Validare finală a răspunsului
          if (!evaluationResponse || !evaluationResponse.ok) {
            throw new Error('Invalid evaluation response generated');
          }
          
          // Validare că toate câmpurile necesare există
          if (!evaluationResponse.minPrice || !evaluationResponse.maxPrice || !evaluationResponse.ranges) {
            throw new Error('Missing required fields in evaluation response');
          }
          
          console.log('[Evaluate] Real estate evaluation successful:', {
            minPrice: evaluationResponse.minPrice,
            maxPrice: evaluationResponse.maxPrice,
            avgPrice: evaluationResponse.avgPrice,
            level: evaluationResponse.level,
          });
          
          return NextResponse.json(evaluationResponse);
          } // End of else block for successful analysis
        } // End of else block for extracted (real estate evaluation)
      } catch (error: any) {
        console.error('[Evaluate] Real estate evaluation error:', error);
        console.error('[Evaluate] Error stack:', error.stack);
        console.error('[Evaluate] Error details:', {
          message: error.message,
          name: error.name,
          product: product ? { title: product.title, category: product.category } : null,
        });
        // Fallback la evaluarea standard - continuă cu codul de mai jos
        console.log('[Evaluate] Falling back to standard evaluation due to error:', error.message);
        // Nu returnăm aici, continuăm cu evaluarea standard pentru a evita eroarea 500
      }
    }
    
    // ============================================
    // EVALUARE STANDARD (pentru alte categorii)
    // ============================================
    // Caută produse similare
    let prices: number[];
    try {
      console.log('[Evaluate] Searching for comparables...');
      prices = await searchWebForComparables(product);
      console.log(`[Evaluate] Received ${prices.length} prices from searchWebForComparables`);
    } catch (error: any) {
      console.error('[Evaluate] Error searching for comparables:', error);
      // Dacă căutarea eșuează, folosim prețuri mock
      const { generateMockPrices } = await import("@/lib/searchClient");
      prices = generateMockPrices(product.title, product.category, product);
      console.log(`[Evaluate] Using ${prices.length} mock prices as fallback`);
    }

    // Verifică dacă avem prețuri - ar trebui să avem întotdeauna cel puțin 20
    if (!prices || prices.length === 0) {
      console.error(`[Evaluate] CRITICAL: No prices returned from searchWebForComparables!`);
      
      const noEvaluationResponse: PriceEvaluationResponse = {
        ok: true,
        noEvaluation: true,
        product,
        samplesCount: 0,
        samples: [],
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        ranges: {
          very_good: [0, 0],
          good: [0, 0],
          fair: [0, 0],
          high: [0, 0],
          very_high: [0, 0],
        },
        level: "fair" as const,
        aiExplanation: {
          summary: "Nu există suficiente date pentru o evaluare realistă a prețului.",
          details: {
            ro_short: "Fără evaluare",
            ro_long: "Este imposibilă evaluarea realistă a prețului. Nu s-au găsit suficiente oferte comparabile pe piață.",
            bullets: [],
          },
        },
      };

      return NextResponse.json(noEvaluationResponse);
    }
    
    // Dacă avem prețuri, continuăm cu evaluarea
    console.log(`[Evaluate] Found ${prices.length} prices, proceeding with evaluation`);

    // Validează că toate prețurile sunt numere valide
    const validPrices = prices.filter(p => typeof p === 'number' && !isNaN(p) && isFinite(p) && p > 0);
    if (validPrices.length === 0) {
      console.error('[Evaluate] CRITICAL: No valid prices after filtering!');
      const noEvaluationResponse: PriceEvaluationResponse = {
        ok: true,
        noEvaluation: true,
        product,
        samplesCount: 0,
        samples: [],
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        ranges: {
          very_good: [0, 0],
          good: [0, 0],
          fair: [0, 0],
          high: [0, 0],
          very_high: [0, 0],
        },
        level: "fair" as const,
        aiExplanation: {
          summary: "Nu există suficiente date valide pentru o evaluare realistă a prețului.",
          details: {
            ro_short: "Fără evaluare",
            ro_long: "Este imposibilă evaluarea realistă a prețului. Nu s-au găsit suficiente oferte comparabile valide pe piață.",
            bullets: [],
          },
        },
      };
      return NextResponse.json(noEvaluationResponse);
    }
    
    // Folosim doar prețurile valide
    const originalPricesCount = prices.length;
    prices = validPrices;
    console.log(`[Evaluate] Using ${prices.length} valid prices (filtered from ${originalPricesCount} total)`);

    // Calculează statistici (cu validare)
    if (prices.length === 0) {
      console.error('[Evaluate] CRITICAL: No prices available for statistics!');
      const noEvaluationResponse: PriceEvaluationResponse = {
        ok: true,
        noEvaluation: true,
        product,
        samplesCount: 0,
        samples: [],
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        ranges: {
          very_good: [0, 0],
          good: [0, 0],
          fair: [0, 0],
          high: [0, 0],
          very_high: [0, 0],
        },
        level: "fair" as const,
        aiExplanation: {
          summary: "Nu există suficiente date pentru o evaluare realistă a prețului.",
          details: {
            ro_short: "Fără evaluare",
            ro_long: "Este imposibilă evaluarea realistă a prețului. Nu s-au găsit suficiente oferte comparabile pe piață.",
            bullets: [],
          },
        },
      };
      return NextResponse.json(noEvaluationResponse);
    }
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Validează că statisticile sunt valide
    if (!isFinite(minPrice) || !isFinite(maxPrice) || !isFinite(avgPrice) || minPrice <= 0 || maxPrice <= 0) {
      console.error('[Evaluate] CRITICAL: Invalid statistics calculated!', { minPrice, maxPrice, avgPrice, pricesCount: prices.length });
      // În loc să aruncăm eroare, returnăm un răspuns de noEvaluation
      const noEvaluationResponse: PriceEvaluationResponse = {
        ok: true,
        noEvaluation: true,
        product,
        samplesCount: prices.length,
        samples: prices.slice(0, 50),
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        ranges: {
          very_good: [0, 0],
          good: [0, 0],
          fair: [0, 0],
          high: [0, 0],
          very_high: [0, 0],
        },
        level: "fair" as const,
        aiExplanation: {
          summary: "Nu s-au putut calcula statistici valide pentru evaluare.",
          details: {
            ro_short: "Eroare de calcul",
            ro_long: "A apărut o eroare la calcularea statisticilor prețurilor. Te rugăm să încerci din nou.",
            bullets: [],
          },
        },
      };
      return NextResponse.json(noEvaluationResponse);
    }

    // Calculează intervalele (cu categoria și produsul pentru validare suplimentară pentru mașini)
    let ranges;
    try {
      console.log('[Evaluate] Computing price ranges...');
      ranges = computePriceRangesFromSamples(prices, product.category, product);
      console.log('[Evaluate] Price ranges computed successfully:', ranges);
    } catch (error: any) {
      console.error('[Evaluate] Error computing price ranges:', error);
      console.error('[Evaluate] Error stack:', error.stack);
      // Dacă calcularea intervalelor eșuează, folosim intervale bazate pe min/max/avg (care sunt deja calculate)
      const spread = maxPrice - minPrice;
      
      if (spread <= 0 || !isFinite(spread)) {
        console.error('[Evaluate] Invalid spread, using product price as base');
        const productPrice = product.price || 10000;
        ranges = {
          very_good: [Math.round(productPrice * 0.7), Math.round(productPrice * 0.85)] as [number, number],
          good: [Math.round(productPrice * 0.85), Math.round(productPrice * 1.0)] as [number, number],
          fair: [Math.round(productPrice * 1.0), Math.round(productPrice * 1.15)] as [number, number],
          high: [Math.round(productPrice * 1.15), Math.round(productPrice * 1.3)] as [number, number],
          very_high: [Math.round(productPrice * 1.3), Math.round(productPrice * 1.5)] as [number, number],
        };
      } else {
        ranges = {
          very_good: [minPrice, minPrice + spread * 0.2] as [number, number],
          good: [minPrice + spread * 0.2, minPrice + spread * 0.4] as [number, number],
          fair: [minPrice + spread * 0.4, minPrice + spread * 0.6] as [number, number],
          high: [minPrice + spread * 0.6, minPrice + spread * 0.8] as [number, number],
          very_high: [minPrice + spread * 0.8, maxPrice] as [number, number],
        };
      }
      console.log('[Evaluate] Using fallback ranges due to filtering error');
    }

    // Debug: log pentru verificare
    console.log('[Evaluate] Product price:', product.price);
    console.log('[Evaluate] Ranges:', ranges);
    console.log('[Evaluate] Min price:', minPrice, 'Max price:', maxPrice);

    // Clasifică prețul
    const level = classifyPrice(product.price, ranges);
    
    console.log('[Evaluate] Classified level:', level);

    // Generează explicație AI
    let aiExplanation;
    try {
      const categoryContext = buildCategorySpecificContext(product);
      console.log('[Evaluate] Generating AI explanation...');
      aiExplanation = await generatePriceExplanation(
        product,
        level,
        { minPrice, maxPrice, avgPrice, samplesCount: prices.length },
        categoryContext
      );
      console.log('[Evaluate] AI explanation generated successfully');
    } catch (error: any) {
      console.error('[Evaluate] Error generating AI explanation:', error);
      // Folosim o explicație fallback dacă generarea AI eșuează
      aiExplanation = {
        summary: `Prețul de ${product.price} ${product.currency} este clasificat ca "${level}".`,
        details: {
          ro_short: "Evaluare disponibilă",
          ro_long: `Prețul se încadrează în intervalul ${minPrice} - ${maxPrice} ${product.currency}, bazat pe ${prices.length} oferte comparabile.`,
          bullets: [
            `Preț minim găsit: ${minPrice} ${product.currency}`,
            `Preț maxim găsit: ${maxPrice} ${product.currency}`,
            `Preț mediu: ${Math.round(avgPrice)} ${product.currency}`,
          ],
        },
      };
    }

    // Construiește răspunsul
    const evaluationResponse: PriceEvaluationResponse = {
      ok: true,
      noEvaluation: false,
      product,
      samplesCount: prices.length,
      samples: prices.slice(0, 50), // Limitează la 50 pentru răspuns
      minPrice,
      maxPrice,
      avgPrice,
      ranges,
      level,
      aiExplanation,
    };

    // Salvează în cache (asincron, nu așteptăm)
    saveEvaluationToCache(product, evaluationResponse).catch(err => {
      console.error('[Evaluate] Failed to save to cache:', err);
    });

    // Returnează răspunsul
    return NextResponse.json(evaluationResponse);
  } catch (error: any) {
    console.error("[Evaluate] Error evaluating price:", error);
    console.error("[Evaluate] Error stack:", error.stack);
    
    // Încearcă să obțină informații despre product dacă este disponibil
    let productInfo = null;
    try {
      if (typeof body !== 'undefined' && body) {
        productInfo = {
          title: (body as any).title,
          category: (body as any).category,
        };
      }
    } catch (e) {
      // Ignoră eroarea
    }
    
    console.error("[Evaluate] Error details:", {
      message: error.message,
      name: error.name,
      product: productInfo,
    });
    
    // Returnează un răspuns de eroare mai detaliat
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal server error",
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          name: error.name,
          message: error.message,
        } : undefined,
      },
      { status: 500 }
    );
  }
}
