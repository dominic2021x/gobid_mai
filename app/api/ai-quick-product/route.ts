import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route pentru crearea rapidă a produselor din imagini și descriere
 * Analizează imaginile cu GPT-5.2 Vision și generează automat toate informațiile necesare
 * Modelele pot fi configurate prin variabile de mediu: OPENAI_VISION_MODEL, OPENAI_GENERATION_MODEL, OPENAI_MODEL
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { enhanceProduct } from '@/lib/ai/ai-product-enhancer';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

// Configurare modele - poate fi suprascrisă prin variabile de mediu
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2';
const GENERATION_MODEL = process.env.OPENAI_GENERATION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2';

interface QuickProductRequest {
  images: string[]; // Array de base64 sau URLs
  description: string;
}

interface GeneratedProduct {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  startingPrice?: number;
  currency: 'RON' | 'EUR';
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  customFields?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: QuickProductRequest = await request.json();
    const { images, description } = body;

    // Validare input
    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'Cel puțin o imagine este necesară' },
        { status: 400 }
      );
    }

    if (!description || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Descrierea este necesară' },
        { status: 400 }
      );
    }

    // Analizează imaginile cu GPT-4 Vision
    const imageAnalysisPrompts = images.map((image, index) => ({
      type: 'image_url' as const,
      image_url: {
        url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
      },
    }));

    const visionPrompt = `Analizează această imagine și extrage DOAR informațiile care sunt VIZIBILE și CERTE în imagine:
- Ce tip de produs este (categorie și subcategorie) - DOAR dacă este clar vizibil
- Caracteristici principale VIZIBILE (marca, model, culoare, dimensiuni, stare) - DOAR dacă sunt văzute în imagine sau menționate explicit în descriere
- NU inventa informații care nu sunt vizibile sau menționate
- NU adăuga detalii despre accesorii, cutii originale, asigurări etc. dacă nu sunt vizibile sau menționate explicit

IMPORTANT: 
- Dacă vezi un cod de produs sau model în imagine sau descriere, extrage-l EXACT așa cum apare
- Dacă vezi o culoare în imagine, spune exact ce culoare vezi
- Dacă NU vezi ceva clar, pune null - NU inventa

Returnează un JSON cu următoarea structură:
{
  "category": "string (ex: Autovehicule, Electronice, Mobilier, Mama și copilul, etc.)",
  "subcategory": "string (ex: Autoturisme, Telefoane, Scaune, Cărucioare, Jucării, etc.)",
  "characteristics": "string (DOAR caracteristici vizibile în imagine)",
  "estimatedPrice": null,
  "currency": null,
  "condition": "string | null (ex: nou, folosit, excelent - DOAR dacă este clar vizibil)",
  "brand": "string | null (DOAR dacă este vizibil în imagine sau menționat explicit în descriere)",
  "model": "string | null (DOAR dacă este vizibil în imagine sau menționat explicit în descriere - extrage EXACT codul/modelul)",
  "color": "string | null (DOAR dacă este clar vizibil în imagine)",
  "dimensions": "string | null (DOAR dacă sunt vizibile)",
  "otherDetails": null
}`;

    // Analizează prima imagine (sau toate dacă sunt mai puține de 3)
    const imagesToAnalyze = images.slice(0, 3);
    const visionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'Ești un expert în analiza produselor. Analizează imaginile și extrage DOAR informații care sunt VIZIBILE și CERTE. NU inventa detalii care nu sunt vizibile. Dacă nu vezi ceva clar, returnează null.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: visionPrompt + `\n\nDescrierea furnizată de utilizator: "${description}"`,
          },
          ...imageAnalysisPrompts.slice(0, imagesToAnalyze.length),
        ],
      },
    ];

    const visionResponse = await openai.chat.completions.create({
      model: VISION_MODEL,
      messages: visionMessages,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const visionData = JSON.parse(visionResponse.choices[0]?.message?.content || '{}');

    // Generează titlu și descriere completă folosind DOAR informațiile reale din imagine și descriere
    const generationPrompt = `Pe baza analizei imaginii și descrierii utilizatorului, generează STRICT bazat pe informații REALE:

REGLI STRICTE:
1. Titlul trebuie să conțină DOAR informații care sunt VIZIBILE în imagine sau MENȚIONATE EXPLICIT în descriere
2. NU inventa detalii despre: cutie originală, asigurare, accesorii etc. dacă nu sunt menționate sau vizibile
3. Dacă descrierea menționează un cod de produs (ex: "iPhone 14"), extrage-l EXACT așa cum apare
4. Dacă descrierea menționează o culoare, folosește-o EXACT așa cum este scrisă
5. Descrierea trebuie să fie bazată pe ce este REAL - nu adăuga informații inventate
6. NU include preț în titlu sau descriere dacă nu este menționat explicit

FOARTE IMPORTANT - STRICT INTERZIS:
- NU crea NICIODATĂ câmpuri despre licitație în customFields sau în altă parte
- NU include: "Requested price", "Min accepted bid", "Has no expiration", "Requested price currency", "Min accepted bid currency"
- NU include: "requested_price", "min_accepted_bid", "has_no_expiration", "requested_price_currency", "min_accepted_bid_currency"
- NU include: orice câmp care conține "price", "bid", "currency", "expiration" în nume
- DOAR informații despre PRODUS: marca, model, culoare, stare, dimensiuni, caracteristici tehnice
- Secțiunea "Informații despre licitație" trebuie să conțină DOAR informații despre PRODUS, NU despre licitație

Informații din analiza imaginii:
${JSON.stringify(visionData, null, 2)}

Descrierea utilizatorului: "${description}"

Returnează JSON:
{
  "title": "string (maxim 100 caractere, DOAR informații reale: marca, model, culoare, stare - dacă sunt disponibile)",
  "description": "string (minim 200 caractere, bazat STRICT pe ce este în descrierea utilizatorului și ce este vizibil în imagine)",
  "category": "string",
  "subcategory": "string",
  "startingPrice": 0,
  "currency": "RON"
}`;

    const generationResponse = await openai.chat.completions.create({
      model: GENERATION_MODEL,
      messages: [
      {
        role: 'system',
        content: 'Ești un expert în extragerea informațiilor despre produse. Generează titluri și descrieri bazate STRICT pe informații REALE din imagini și descriere. NU inventa detalii care nu sunt vizibile sau menționate explicit. NU adăuga informații despre accesorii, cutii originale, asigurări etc. dacă nu sunt menționate sau vizibile. FOARTE IMPORTANT: NU crea NICIODATĂ câmpuri despre licitație (preț, currency, expiration, bid etc.) în customFields sau în altă parte. DOAR informații despre PRODUS: marca, model, culoare, stare, dimensiuni, caracteristici tehnice.',
      },
        {
          role: 'user',
          content: generationPrompt,
        },
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      temperature: 0.3, // Redus pentru a fi mai strict și precis
    });

    const generatedData = JSON.parse(generationResponse.choices[0]?.message?.content || '{}');

    // Generează SEO folosind API-ul existent
    let seoData = {
      seoTitle: generatedData.title?.substring(0, 65) || '',
      seoDescription: generatedData.description?.substring(0, 160) || '',
      seoKeywords: '',
    };

    try {
      const enhanceResult = await enhanceProduct({
        titlu: generatedData.title || '',
        descriere: generatedData.description || '',
        specificatii: visionData.characteristics || '',
      });

      seoData = {
        seoTitle: enhanceResult.seoTitle || generatedData.title?.substring(0, 65) || '',
        seoDescription: enhanceResult.seoDescription || generatedData.description?.substring(0, 160) || '',
        seoKeywords: enhanceResult.seoKeywords || '',
      };
    } catch (seoError) {
      console.error('Error generating SEO, using fallback:', seoError);
      // Folosim datele de bază dacă SEO-ul eșuează
    }

    // Construiește customFields din informațiile extrase - DOAR informații despre PRODUS, nu despre licitație
    const customFields: Record<string, any> = {};
    // DOAR marca, model, culoare, stare, dimensiuni - informații STRICT despre produs
    // STRICT INTERZIS: NU adăuga niciodată câmpuri despre licitație (preț, currency, expiration, bid etc.)
    if (visionData.brand) customFields.marca = visionData.brand;
    if (visionData.model) customFields.model = visionData.model;
    if (visionData.color) customFields.culoare = visionData.color;
    if (visionData.condition) customFields.stare = visionData.condition;
    if (visionData.dimensions) customFields.dimensiuni = visionData.dimensions;
    // NU adăugăm otherDetails, estimatedPrice, currency sau alte informații despre licitație
    // NU adăugăm: requested_price, min_accepted_bid, has_no_expiration, requested_price_currency, min_accepted_bid_currency

    const result: GeneratedProduct = {
      title: generatedData.title || 'Produs fără titlu',
      description: generatedData.description || description,
      category: generatedData.category || visionData.category || 'Diverse / Speciale',
      subcategory: generatedData.subcategory || visionData.subcategory || 'Alte',
      startingPrice: generatedData.startingPrice || visionData.estimatedPrice || 100,
      currency: (generatedData.currency || visionData.currency || 'RON') as 'RON' | 'EUR',
      seoTitle: seoData.seoTitle,
      seoDescription: seoData.seoDescription,
      seoKeywords: seoData.seoKeywords,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    };

    return NextResponse.json({
      success: true,
      product: result,
    });
  } catch (error: any) {
    console.error('Error generating quick product:', error);
    return NextResponse.json(
      {
        error: 'Eroare la generarea produsului',
        message: error.message,
      },
      { status: 500 }
    );
  }
}



































