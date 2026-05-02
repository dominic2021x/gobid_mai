/**
 * AI Product Enhancer - Modul unificat pentru:
 * 1. Rescriere automată a titlului și descrierii (anti-duplicat)
 * 2. Generare automată de SEO optimizat
 */

import { rewriteProductText } from './ai-rewriter';
import { generateSEO } from './seo-generator';

interface ProductEnhanceInput {
  titlu: string;
  descriere: string;
  specificatii?: string;
}

interface ProductEnhanceResult {
  newTitle: string;
  newDescription: string;
  similarityScore: number;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
}

/**
 * Funcție principală care unifică rescrierea și generarea SEO
 * Procesul:
 * 1. Rescrie titlul și descrierea pentru unicitate
 * 2. Generează SEO optimizat bazat pe textele rescrise
 */
export async function enhanceProduct(
  input: ProductEnhanceInput
): Promise<ProductEnhanceResult> {
  const { titlu, descriere, specificatii } = input;

  try {
    // PASUL 1: Rescrie titlul și descrierea pentru unicitate
    const rewriteResult = await rewriteProductText({
      titlu,
      descriere,
      specificatii
    });

    // PASUL 2: Generează SEO optimizat bazat pe textele RESCRISE
    // (folosim newTitle și newDescription pentru SEO, nu originale)
    const seoResult = await generateSEO({
      titlu: rewriteResult.newTitle,
      descriere: rewriteResult.newDescription,
      specificatii
    });

    // Returnează rezultatul combinat
    return {
      newTitle: rewriteResult.newTitle,
      newDescription: rewriteResult.newDescription,
      similarityScore: rewriteResult.similarityScore,
      seoTitle: seoResult.seoTitle,
      seoDescription: seoResult.seoDescription,
      seoKeywords: seoResult.seoKeywords
    };
  } catch (error) {
    console.error('Error in enhanceProduct:', error);
    
    // Fallback: dacă rescrierea eșuează, generează doar SEO pe textul original
    try {
      const seoResult = await generateSEO({
        titlu,
        descriere,
        specificatii
      });

      return {
        newTitle: titlu,
        newDescription: descriere,
        similarityScore: 1.0, // Similaritate maximă = nu s-a rescris
        seoTitle: seoResult.seoTitle,
        seoDescription: seoResult.seoDescription,
        seoKeywords: seoResult.seoKeywords
      };
    } catch (seoError) {
      console.error('Error in SEO fallback:', seoError);
      throw new Error('Nu s-a putut procesa produsul. Vă rugăm încercați din nou.');
    }
  }
}

/**
 * Verifică disponibilitatea serviciilor AI
 */
export async function checkAIServicesAvailable(): Promise<{
  openaiAvailable: boolean;
  embeddingsAvailable: boolean;
}> {
  try {
    // Verifică ChatGPT (OpenAI)
    const { checkChatGPTForRewrite } = await import('./ai-rewriter');
    const openaiAvailable = checkChatGPTForRewrite();

    // Verifică embeddings (încearcă să inițializeze modelul)
    let embeddingsAvailable = false;
    try {
      const { initializeEmbeddings } = await import('./embeddings');
      await initializeEmbeddings();
      embeddingsAvailable = true;
    } catch {
      embeddingsAvailable = false;
    }

    return {
      openaiAvailable,
      embeddingsAvailable
    };
  } catch (error) {
    console.error('Error checking AI services:', error);
    return {
      openaiAvailable: false,
      embeddingsAvailable: false
    };
  }
}

















