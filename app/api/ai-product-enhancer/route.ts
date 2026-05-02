import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route pentru îmbunătățirea automată a produselor cu AI
 * Unifică rescrierea textelor și generarea SEO.
 * Opțional: analizează imagini (mobilă veche/nouă, renovat/nerenovat) pentru descriere mai realistă.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { enhanceProduct, checkAIServicesAvailable } from '@/lib/ai/ai-product-enhancer';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({ apiKey: OPENAI_SDK_API_KEY });

/** Analizează imaginile cu Vision pentru mobilă, renovare, stare. Returnează text scurt sau null. */
async function analyzeImagesForDescription(
  images: string[],
  titlu: string
): Promise<string | null> {
  if (!images?.length || !process.env.OPENAI_API_KEY) return null;

  const imageParts = images.slice(0, 5).map((img) => ({
    type: 'image_url' as const,
    image_url: {
      url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`,
    },
  }));

  const prompt = `Analizează imaginile acestui anunț (titlu: "${titlu}") și descrie pe scurt, în română, DOAR ce este VIZIBIL:

1. **Mobilă**: Este veche, nouă, sau mixtă? (scaune, mese, dulapuri, pat)
2. **Renovare**: Spațiul pare renovat, nerenovat, parțial renovat? (pereți, podea, gresie/parchet, uși)
3. **Stare generală**: Bucătărie, baie, hol – ce observi? (curat, uzat, modern, dat în gri etc.)

Reguli:
- Nu inventa. Scrie doar ce vezi clar în imagini.
- Dacă imaginile nu sunt despre locuințe/imobiliare, spune ce produs e și starea lui vizibilă.
- Răspunde în 2–4 propoziții, concis.

Returnează DOAR textul observațiilor, fără "Observații din imagini:" – îl adăugăm noi.`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ești un expert care analizează imagini pentru anunțuri imobiliare. Răspunde concis, doar în română.' },
        { role: 'user', content: [{ type: 'text', text: prompt }, ...imageParts] },
      ],
      max_tokens: 400,
    });
    const text = res.choices?.[0]?.message?.content?.trim();
    return text ? `Observații din imagini: ${text}` : null;
  } catch (e) {
    console.warn('Vision analysis failed:', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titlu, descriere, specificatii, images } = body;

    if (!titlu || !descriere) {
      return NextResponse.json(
        { error: 'Titlu și descriere sunt obligatorii' },
        { status: 400 }
      );
    }

    let augmentedSpec = specificatii?.trim() || '';

    if (Array.isArray(images) && images.length > 0) {
      const imageAnalysis = await analyzeImagesForDescription(images, String(titlu));
      if (imageAnalysis) {
        augmentedSpec = augmentedSpec ? `${augmentedSpec}\n\n${imageAnalysis}` : imageAnalysis;
      }
    }

    const result = await enhanceProduct({
      titlu: titlu.trim(),
      descriere: descriere.trim(),
      specificatii: augmentedSpec || undefined,
    });

    const services = await checkAIServicesAvailable();

    return NextResponse.json({
      success: true,
      data: result,
      services: {
        openaiAvailable: services.openaiAvailable,
        embeddingsAvailable: services.embeddingsAvailable,
      },
    });
  } catch (error: any) {
    console.error('Error enhancing product:', error);
    return NextResponse.json(
      { error: 'Eroare la îmbunătățirea produsului', message: error.message },
      { status: 500 }
    );
  }
}

// Endpoint pentru verificare disponibilitate servicii
export async function GET(request: NextRequest) {
  try {
    const services = await checkAIServicesAvailable();
    return NextResponse.json({
      openaiAvailable: services.openaiAvailable,
      embeddingsAvailable: services.embeddingsAvailable
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        openaiAvailable: false,
        embeddingsAvailable: false 
      },
      { status: 200 }
    );
  }
}

















