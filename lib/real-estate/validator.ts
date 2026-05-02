import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Validator - Modulul #4 (Decision Engine)
 * Verifică coerența evaluării și decide dacă trebuie re-analizare
 */

import OpenAI from 'openai';
import { AnalysisResult } from './aiAnalyzer';
import { ExtractedCriteria } from './aiExtractor';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface ValidationResult {
  valid: boolean;
  needsReanalysis: boolean;
  confidence: number; // 0-100
  issues: string[];
  recommendations: string[];
  recalculated?: AnalysisResult;
}

/**
 * Validează evaluarea finală folosind Decision Engine (GPT-4o)
 */
export async function validateEvaluation(
  extracted: ExtractedCriteria,
  analysis: AnalysisResult,
  comparablesCount: number
): Promise<ValidationResult> {
  if (!process.env.OPENAI_API_KEY) {
    // Fallback: validare simplă
    return performFallbackValidation(extracted, analysis, comparablesCount);
  }

  const systemPrompt = `Ești modulul #4 (Validator) al Evaluatorului Imobiliar Profesional.
Sarcina ta este să verifici coerența evaluării și să decizi dacă trebuie re-analizare.

Reguli de validare:
1. Dacă (p80 - p20) > 60% → trigger_reanalysis (prea multă variație)
2. Dacă comparabile < 5 → retry_search_with_relaxed_filters
3. Dacă clasificarea nu se potrivește cu percentile → recalculate
4. Dacă preț/mp subiect este mult diferit de mediană → verifică filtrarea
5. Dacă există inconsistențe între criterii extrase și analiză → flag issue

Întoarce STRICT JSON cu:
- valid: boolean
- needsReanalysis: boolean
- confidence: 0-100
- issues: string[]
- recommendations: string[]`;

  const userPrompt = `Validează următoarea evaluare:

CRITERII EXTRASE:
${JSON.stringify(extracted, null, 2)}

ANALIZĂ FINALĂ:
${JSON.stringify(analysis, null, 2)}

NUMĂR COMPARABILE: ${comparablesCount}

Verifică:
1. Coerența între criterii și analiză
2. Dacă percentile sunt realiste
3. Dacă clasificarea este corectă
4. Dacă sunt suficiente comparabile
5. Dacă există inconsistențe

Răspunde în format JSON:
{
  "valid": true,
  "needsReanalysis": false,
  "confidence": 85,
  "issues": [],
  "recommendations": []
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
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
    const validation = JSON.parse(responseText) as ValidationResult;

    // Validare suplimentară bazată pe reguli
    const ruleBasedValidation = performRuleBasedValidation(extracted, analysis, comparablesCount);
    
    // Combină validările
    return {
      ...validation,
      issues: [...(validation.issues || []), ...ruleBasedValidation.issues],
      recommendations: [...(validation.recommendations || []), ...ruleBasedValidation.recommendations],
      needsReanalysis: validation.needsReanalysis || ruleBasedValidation.needsReanalysis,
      confidence: Math.min(validation.confidence || 50, ruleBasedValidation.confidence),
    };
  } catch (error: any) {
    console.error('[Validator] Error:', error);
    return performFallbackValidation(extracted, analysis, comparablesCount);
  }
}

/**
 * Validare bazată pe reguli (fără AI)
 */
function performRuleBasedValidation(
  extracted: ExtractedCriteria,
  analysis: AnalysisResult,
  comparablesCount: number
): ValidationResult {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let needsReanalysis = false;
  let confidence = 100;

  // Regula 1: Variație mare între percentile
  const percentileRange = analysis.percentile.p80 - analysis.percentile.p20;
  const percentileRangePercent = (percentileRange / analysis.percentile.p20) * 100;
  
  if (percentileRangePercent > 60) {
    issues.push(`Variație mare între percentile (${percentileRangePercent.toFixed(1)}%)`);
    needsReanalysis = true;
    recommendations.push('Relaxează filtrele de căutare pentru mai multe comparabile');
    confidence -= 20;
  }

  // Regula 2: Prea puține comparabile
  if (comparablesCount < 5) {
    issues.push(`Prea puține comparabile (${comparablesCount})`);
    needsReanalysis = true;
    recommendations.push('Caută cu filtre mai relaxate sau în zone similare');
    confidence -= 30;
  }

  // Regula 3: Clasificare inconsistentă
  if (analysis.pret_mp_subiect) {
    if (analysis.clasificare === 'sub_piata' && analysis.pret_mp_subiect >= analysis.percentile.p20) {
      issues.push('Clasificare inconsistentă: preț nu corespunde cu "sub_piata"');
      needsReanalysis = true;
      confidence -= 15;
    } else if (analysis.clasificare === 'peste_piata' && analysis.pret_mp_subiect <= analysis.percentile.p80 * 1.2) {
      issues.push('Clasificare inconsistentă: preț nu corespunde cu "peste_piata"');
      needsReanalysis = true;
      confidence -= 15;
    }
  }

  // Regula 4: Preț/mp nerealist
  if (analysis.pret_mp_subiect) {
    const median = (analysis.percentile.p40 + analysis.percentile.p60) / 2;
    const diffFromMedian = Math.abs(analysis.pret_mp_subiect - median) / median;
    
    if (diffFromMedian > 0.5) {
      issues.push(`Preț/mp diferă semnificativ de mediană (${(diffFromMedian * 100).toFixed(1)}%)`);
      recommendations.push('Verifică dacă filtrarea comparabilelor este corectă');
      confidence -= 10;
    }
  }

  // Regula 5: Criterii incomplete
  if (extracted.tip === 'apartament' && !extracted.criterii.suprafata) {
    issues.push('Suprafață lipsă pentru apartament');
    confidence -= 10;
  }

  if (extracted.tip === 'casa' && !extracted.criterii.suprafata && !extracted.criterii.suprafata_teren) {
    issues.push('Suprafață lipsă pentru casă');
    confidence -= 10;
  }

  return {
    valid: issues.length === 0 && !needsReanalysis,
    needsReanalysis,
    confidence: Math.max(0, confidence),
    issues,
    recommendations,
  };
}

/**
 * Validare fallback (fără AI)
 */
function performFallbackValidation(
  extracted: ExtractedCriteria,
  analysis: AnalysisResult,
  comparablesCount: number
): ValidationResult {
  return performRuleBasedValidation(extracted, analysis, comparablesCount);
}

