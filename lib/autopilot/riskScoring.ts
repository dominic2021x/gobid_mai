import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Risk Scoring System - Calculează scorul de risc pentru fiecare task Autopilot
 * Analizează cost, tip conținut, moderare, duplicate și istoric pentru a calcula un scor 0-100
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface RiskScoreFactors {
  costScore: number;
  typeScore: number;
  moderationScore: number;
  duplicateScore: number;
  historyScore: number;
  totalScore: number;
}

export interface RiskFactorDescription {
  factor: string;
  score: number;
  description: string;
}

/**
 * Calculează scorul de risc pentru un task (0-100)
 */
export async function calculateRiskScore(task: {
  type: string;
  payload: any;
  est_cost_usd?: number;
}): Promise<{ score: number; factors: RiskScoreFactors; factorDescriptions: RiskFactorDescription[] }> {
  let score = 0;
  const factors: RiskScoreFactors = {
    costScore: 0,
    typeScore: 0,
    moderationScore: 0,
    duplicateScore: 0,
    historyScore: 0,
    totalScore: 0,
  };
  const factorDescriptions: RiskFactorDescription[] = [];

  try {
    // 1️⃣ Scor bazat pe cost
    const cost = Number(task.est_cost_usd || 0);
    if (cost > 50) {
      factors.costScore = 25;
      score += 25;
      factorDescriptions.push({
        factor: 'Cost ridicat',
        score: 25,
        description: `Cost ridicat (>50 USD) - ${cost.toFixed(2)} USD`,
      });
    } else if (cost > 20) {
      factors.costScore = 15;
      score += 15;
      factorDescriptions.push({
        factor: 'Cost moderat',
        score: 15,
        description: `Cost moderat (>20 USD) - ${cost.toFixed(2)} USD`,
      });
    } else if (cost > 10) {
      factors.costScore = 5;
      score += 5;
      factorDescriptions.push({
        factor: 'Cost ușor ridicat',
        score: 5,
        description: `Cost ușor ridicat (>10 USD) - ${cost.toFixed(2)} USD`,
      });
    }

    // 2️⃣ Scor bazat pe tip conținut
    switch (task.type) {
      case 'video':
        factors.typeScore = 10;
        score += 10;
        factorDescriptions.push({
          factor: 'Tip conținut',
          score: 10,
          description: 'Conținut video — complexitate ridicată',
        });
        break;
      case 'email':
        factors.typeScore = 5;
        score += 5;
        factorDescriptions.push({
          factor: 'Tip conținut',
          score: 5,
          description: 'Email — risc moderat',
        });
        break;
      case 'seo':
        factors.typeScore = 15;
        score += 15;
        factorDescriptions.push({
          factor: 'Tip conținut',
          score: 15,
          description: 'Optimizare SEO — risc de conținut duplicat',
        });
        break;
      case 'article':
        factors.typeScore = 20;
        score += 20;
        factorDescriptions.push({
          factor: 'Tip conținut',
          score: 20,
          description: 'Articol text — posibil conținut sensibil',
        });
        break;
      case 'social':
        factors.typeScore = 8;
        score += 8;
        factorDescriptions.push({
          factor: 'Tip conținut',
          score: 8,
          description: 'Postare social media — risc moderat',
        });
        break;
      default:
        factors.typeScore = 0;
    }

    // 3️⃣ Scor bazat pe moderare text
    const textToCheck =
      task.payload?.text ||
      task.payload?.descriere ||
      task.payload?.content ||
      task.payload?.titlu_seo ||
      task.payload?.title ||
      '';

    if (textToCheck && textToCheck.length > 10) {
      try {
        const moderation = await openai.moderations.create({
          model: 'omni-moderation-latest',
          input: textToCheck.slice(0, 1000),
        });

        if (moderation.results[0].flagged) {
          // Verifică categorii specifice
          const categories = moderation.results[0].categories;
          const flaggedCategories = Object.entries(categories)
            .filter(([_, flagged]) => flagged)
            .map(([category]) => category);

          // Scor mai mare pentru categorii critice
          if (flaggedCategories.some((c) => ['hate', 'harassment', 'self-harm'].includes(c))) {
            factors.moderationScore = 50;
            score += 50;
            factorDescriptions.push({
              factor: 'Moderare AI',
              score: 50,
              description: `Posibil conținut sensibil detectat de modelul de moderare (${flaggedCategories.join(', ')})`,
            });
          } else if (flaggedCategories.some((c) => ['violence', 'sexual'].includes(c))) {
            factors.moderationScore = 40;
            score += 40;
            factorDescriptions.push({
              factor: 'Moderare AI',
              score: 40,
              description: `Conținut potențial problematic detectat (${flaggedCategories.join(', ')})`,
            });
          } else {
            factors.moderationScore = 30;
            score += 30;
            factorDescriptions.push({
              factor: 'Moderare AI',
              score: 30,
              description: `Posibil conținut sensibil detectat de modelul de moderare (${flaggedCategories.join(', ')})`,
            });
          }
        }
      } catch (modError) {
        console.error('[RiskScoring] Error in moderation check:', modError);
        // Nu adăugăm scor dacă moderarea eșuează
      }
    }

    // 4️⃣ Scor bazat pe similaritate semantică (posibil duplicat)
    if (textToCheck && textToCheck.length > 50) {
      try {
        if (!supabaseAdmin) {
          // Skip duplicate check if database not configured
          return { score, factors, factorDescriptions };
        }

        const { data: produse, error: prodError } = await supabaseAdmin
          .from('produse')
          .select('descriere, titlu')
          .limit(100);

        if (!prodError && produse) {
          // Verifică similaritate simplă (primele 50 caractere)
          const taskTextStart = textToCheck.slice(0, 50).toLowerCase().trim();
          const similar = produse.find((p) => {
            const descriere = (p.descriere || '').toLowerCase().trim();
            const titlu = (p.titlu || '').toLowerCase().trim();
            return (
              (descriere.length > 50 &&
                descriere.slice(0, 50) === taskTextStart) ||
              (titlu.length > 20 && titlu.slice(0, 20) === taskTextStart.slice(0, 20))
            );
          });

          if (similar) {
            factors.duplicateScore = 20;
            score += 20;
            factorDescriptions.push({
              factor: 'Duplicate',
              score: 20,
              description: 'Conținut similar cu un produs existent',
            });
          }

          // Verifică și în tabelul SEO
          const { data: seoData } = await supabaseAdmin
            .from('seo')
            .select('titlu_seo, descriere_seo')
            .limit(100);

          if (seoData) {
            const similarSeo = seoData.find((s) => {
              const titluSeo = (s.titlu_seo || '').toLowerCase().trim();
              const descriereSeo = (s.descriere_seo || '').toLowerCase().trim();
              return (
                (titluSeo.length > 20 && titluSeo.slice(0, 20) === taskTextStart.slice(0, 20)) ||
                (descriereSeo.length > 50 && descriereSeo.slice(0, 50) === taskTextStart)
              );
            });

            if (similarSeo) {
              factors.duplicateScore = 20;
              score += 20;
              if (!factorDescriptions.some((f) => f.factor === 'Duplicate')) {
                factorDescriptions.push({
                  factor: 'Duplicate',
                  score: 20,
                  description: 'Conținut similar cu un produs existent',
                });
              }
            }
          }
        }
      } catch (dupError) {
        console.error('[RiskScoring] Error in duplicate check:', dupError);
      }
    }

    // 5️⃣ Scor bazat pe istoric erori AI
    try {
      if (!supabaseAdmin) {
        // Skip history check if database not configured
        return { score, factors, factorDescriptions };
      }

      const { data: oldFails, error: historyError } = await supabaseAdmin
        .from('autopilot_tasks')
        .select('id')
        .eq('status', 'failed')
        .eq('type', task.type)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Ultimele 7 zile

      if (!historyError && oldFails) {
        if (oldFails.length > 5) {
          factors.historyScore = 15;
          score += 15;
          factorDescriptions.push({
            factor: 'Istoric erori',
            score: 15,
            description: `Mai mult de 5 task-uri eșuate de acest tip în ultimele 7 zile`,
          });
        } else if (oldFails.length > 3) {
          factors.historyScore = 10;
          score += 10;
          factorDescriptions.push({
            factor: 'Istoric erori',
            score: 10,
            description: `Mai mult de 3 task-uri eșuate de acest tip în ultimele 7 zile`,
          });
        } else if (oldFails.length > 1) {
          factors.historyScore = 5;
          score += 5;
          factorDescriptions.push({
            factor: 'Istoric erori',
            score: 5,
            description: `Mai mult de 1 task eșuat de acest tip în ultimele 7 zile`,
          });
        }
      }
    } catch (histError) {
      console.error('[RiskScoring] Error in history check:', histError);
    }

    // Normalizează scorul (0-100)
    if (score > 100) score = 100;
    if (score < 0) score = 0;

    factors.totalScore = score;

    return { score, factors, factorDescriptions };
  } catch (error) {
    console.error('[RiskScoring] Error calculating risk score:', error);
    // În caz de eroare, returnează scor mediu
    return { score: 50, factors, factorDescriptions: [] };
  }
}

/**
 * Obține nivelul de risc pe baza scorului
 */
export function getRiskLevel(score: number): {
  level: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  label: string;
} {
  if (score >= 80) {
    return {
      level: 'critical',
      color: 'red',
      label: 'Risc Critic',
    };
  } else if (score >= 60) {
    return {
      level: 'high',
      color: 'orange',
      label: 'Risc Ridicat',
    };
  } else if (score >= 25) {
    return {
      level: 'medium',
      color: 'yellow',
      label: 'Risc Mediu',
    };
  } else {
    return {
      level: 'low',
      color: 'green',
      label: 'Risc Scăzut',
    };
  }
}

/**
 * Generează explicație AI pentru scorul de risc
 */
export async function generateRiskExplanation(
  task: {
    type: string;
    payload: any;
    est_cost_usd?: number;
  },
  score: number,
  factorDescriptions: RiskFactorDescription[]
): Promise<string> {
  try {
    const context = `
Analizează următorul task AI:

Tip: ${task.type}
Cost estimat: ${task.est_cost_usd || 0} USD
Payload: ${JSON.stringify(task.payload, null, 2).slice(0, 500)}

Scor calculat: ${score} / 100

Factori tehnici identificați:
${factorDescriptions.map((f) => `- ${f.description} (${f.score} puncte)`).join('\n')}

Scrie o explicație clară, scurtă (3-4 propoziții) în limba română,
care să justifice scorul de risc. Explică riscurile principale,
dar fără limbaj tehnic. Fii concis și direct.

Exemplu de răspuns:
"Textul conține formulări similare cu alte descrieri existente
și un cost de generare ridicat. Se recomandă revizuirea înainte de publicare."
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Ești un expert în analiza riscurilor AI. Scrii explicații clare, concise și în limba română pentru non-tehnici.',
        },
        {
          role: 'user',
          content: context,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const explanation = completion.choices[0]?.message?.content?.trim() || '';

    if (!explanation) {
      // Fallback explicatie simplă
      if (factorDescriptions.length > 0) {
        return factorDescriptions
          .map((f) => f.description)
          .join('. ')
          .concat('. Se recomandă revizuirea înainte de publicare.');
      }
      return `Scor de risc: ${score}/100. Se recomandă revizuirea înainte de publicare.`;
    }

    return explanation;
  } catch (error) {
    console.error('[RiskScoring] Error generating risk explanation:', error);
    // Fallback explicatie simplă
    if (factorDescriptions.length > 0) {
      return factorDescriptions
        .map((f) => f.description)
        .join('. ')
        .concat('. Se recomandă revizuirea înainte de publicare.');
    }
    return `Scor de risc: ${score}/100. Se recomandă revizuirea înainte de publicare.`;
  }
}

