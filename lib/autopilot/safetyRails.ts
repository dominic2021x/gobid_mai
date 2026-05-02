import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Safety Rails System - Sistem de protecție pentru Autopilot AI
 * Previne erori, conținut duplicat, texte nepotrivite și depășiri de buget
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';
import { canSpend } from './costGuard';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * 1️⃣ Verificare buget înainte de fiecare task
 */
export async function checkBudget(costUsd: number): Promise<boolean> {
  try {
    const allowed = await canSpend(costUsd);
    if (!allowed) {
      throw new Error(`Depășește bugetul lunar! (${costUsd.toFixed(2)} USD)`);
    }
    return true;
  } catch (error: any) {
    console.error('[SafetyRails] Budget check failed:', error.message);
    throw error;
  }
}

/**
 * 2️⃣ Verificare duplicat text/titlu
 */
export async function checkDuplicate(
  content: string,
  type: 'seo' | 'article' | 'video' | 'social' | 'email' = 'seo'
): Promise<boolean> {
  try {
    if (!content || content.length < 10) {
      return false; // Conținut prea scurt, nu poate fi duplicat
    }

    // Extrage primele 25 de caractere pentru căutare
    const searchQuery = content.slice(0, 25).trim();

    let tableName: string;
    let fieldName: string;

    switch (type) {
      case 'seo':
        tableName = 'seo';
        fieldName = 'titlu_seo';
        break;
      case 'article':
        tableName = 'produse'; // Poate fi schimbat în 'articles' dacă există
        fieldName = 'titlu';
        break;
      case 'video':
        tableName = 'clipuri_video';
        fieldName = 'titlu';
        break;
      default:
        tableName = 'produse';
        fieldName = 'titlu';
    }

    if (!supabaseAdmin) {
      // Skip duplicate check if database not configured
      return false;
    }

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .ilike(fieldName, `%${searchQuery}%`)
      .limit(5);

    if (error) {
      console.error('[SafetyRails] Error checking duplicate:', error);
      return false; // Dacă e eroare, permite continuarea (nu blochează)
    }

    if (data && data.length > 0) {
      // Verifică similaritatea mai detaliat
      const isSimilar = data.some((item: any) => {
        const existingTitle = (item[fieldName] || '').toLowerCase();
        const newTitle = content.toLowerCase();
        // Verifică dacă există o similaritate > 80%
        const similarity = calculateSimilarity(existingTitle, newTitle);
        return similarity > 0.8;
      });

      if (isSimilar) {
        throw new Error(`Conținut duplicat detectat în ${tableName}.`);
      }
    }

    return false; // Nu e duplicat
  } catch (error: any) {
    if (error.message.includes('duplicat')) {
      throw error;
    }
    console.error('[SafetyRails] Error in checkDuplicate:', error);
    return false; // Permite continuarea dacă e altă eroare
  }
}

/**
 * Calculează similaritatea între două string-uri (Levenshtein simplificat)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculează distanța Levenshtein între două string-uri
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * 3️⃣ Moderare AI - Verifică conținut nepotrivit
 */
export async function checkModeration(text: string): Promise<boolean> {
  try {
    if (!text || text.length < 10) {
      return true; // Text prea scurt, nu necesită moderare
    }

    // Folosește OpenAI Moderation API
    const moderation = await openai.moderations.create({
      input: text,
      model: 'omni-moderation-latest',
    });

    const result = moderation.results[0];

    if (result.flagged) {
      // Logează categoriile flaggate pentru debugging
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_, flagged]) => flagged)
        .map(([category]) => category);

      console.warn(
        `[SafetyRails] Content flagged: ${flaggedCategories.join(', ')}`
      );

      throw new Error(
        `Conținut respins de AI Moderation (${flaggedCategories.join(', ')})`
      );
    }

    return true;
  } catch (error: any) {
    if (error.message.includes('respins')) {
      throw error;
    }
    console.error('[SafetyRails] Error in checkModeration:', error);
    // Dacă API-ul de moderare eșuează, permite continuarea (nu blochează)
    return true;
  }
}

/**
 * 4️⃣ Fallback inteligent - Retry cu model alternativ dacă eșuează
 */
export async function safeGenerate(
  prompt: string,
  model: string = 'gpt-4o',
  fallbackModel: string = 'gpt-4o-mini'
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 2000,
    });

    return completion.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.warn(
      `[SafetyRails] Fallback activat: ${model} → ${fallbackModel}`,
      error.message
    );

    try {
      // Retry cu model alternativ
      const fallbackCompletion = await openai.chat.completions.create({
        model: fallbackModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 2000,
      });

      return fallbackCompletion.choices[0]?.message?.content || '';
    } catch (fallbackError: any) {
      console.error('[SafetyRails] Fallback also failed:', fallbackError);
      throw new Error(
        `Ambele modele au eșuat: ${model} și ${fallbackModel}`
      );
    }
  }
}

/**
 * 5️⃣ Log rezultat Safety Rails
 */
export async function logRailResult(
  task: {
    type: string;
    payload: any;
    est_cost_usd?: number;
  },
  status: 'blocked' | 'passed' | 'done' | 'failed',
  message: string
): Promise<void> {
  try {
    // Log în consolă
    console.log(`[SafetyRails] ${status.toUpperCase()} → ${message}`);

    // Log în Supabase (dacă status-ul este 'blocked', marchează task-ul ca blocat)
    // Notă: Task-ul a fost deja inserat în autopilot_tasks în route.ts, aici doar logăm
    if (status === 'blocked') {
      // Task-ul este deja blocat în route.ts, aici doar logăm mesajul
      console.log(`[SafetyRails] Task blocked: ${message}`);
    }
  } catch (error) {
    console.error('[SafetyRails] Error logging result:', error);
  }
}

/**
 * 6️⃣ Verificare completă Safety Rails pentru un task
 */
export async function runSafetyChecks(task: {
  type: string;
  payload: any;
  est_cost_usd: number;
}): Promise<{ passed: boolean; error?: string }> {
  try {
    // 1. Verifică bugetul
    await checkBudget(task.est_cost_usd);

    // 2. Verifică duplicate (doar pentru SEO și Article)
    if (task.type === 'seo' && task.payload?.titlu_seo) {
      await checkDuplicate(task.payload.titlu_seo, 'seo');
    } else if (task.type === 'article' && task.payload?.title) {
      await checkDuplicate(task.payload.title, 'article');
    } else if (task.type === 'video' && task.payload?.titlu) {
      await checkDuplicate(task.payload.titlu, 'video');
    }

    // 3. Verifică moderare pentru conținut text
    if (task.payload?.text) {
      await checkModeration(task.payload.text);
    } else if (task.payload?.descriere) {
      await checkModeration(task.payload.descriere);
    } else if (task.payload?.content) {
      await checkModeration(task.payload.content);
    }

    // Toate verificările au trecut
    await logRailResult(task, 'passed', 'Toate verificările Safety Rails au trecut');
    return { passed: true };
  } catch (error: any) {
    await logRailResult(task, 'blocked', error.message || 'Eroare necunoscută');
    return { passed: false, error: error.message };
  }
}

